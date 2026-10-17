import type {
  CreateReviewDocumentInput,
  DocumentReviewStore,
  ReviewMutationResult,
} from "@/application/ports/document-review-store";
import type { SessionStore } from "@/application/ports/session-store";
import { getTemporaryStorageConfig } from "@/application/config/temporary-storage";
import { applyQuestionEdits } from "@/application/services/review-question";
import type { ReviewDocument } from "@/domain/review-document";
import type { MultipleChoiceQuestion } from "@/domain/question";
import { getRedisClient } from "@/infrastructure/storage/redis-client";
import {
  StorageRecordTooLargeError,
  StorageUnavailableError,
} from "@/infrastructure/storage/storage-error";
import { storedReviewDocumentSchema } from "@/infrastructure/storage/storage-schemas";

type StoredDocument = {
  schemaVersion: 1;
  ownerId: string;
  lastMutationId: string | null;
  data: ReviewDocument;
};

const documentKey = (id: string) => `mcqforge:v1:document:${id}`;
const sessionKey = (id: string) => `mcqforge:v1:session:${id}`;

const getOwnedScript = `
local sessionRaw = redis.call("GET", KEYS[2])
if not sessionRaw then return {false} end
local session = cjson.decode(sessionRaw)
if tonumber(session.expiresAt) <= tonumber(ARGV[4]) or tonumber(session.hardExpiresAt) <= tonumber(ARGV[4]) then return {false} end
local raw = redis.call("GET", KEYS[1])
if not raw then return {false} end
local record = cjson.decode(raw)
if record.schemaVersion ~= 1 or record.ownerId ~= ARGV[1] then return {false} end
record.data.expiresAt = tonumber(ARGV[2])
local updated = cjson.encode(record)
redis.call("SET", KEYS[1], updated, "EX", ARGV[3])
return {updated}
`;

const createScript = `
local sessionRaw = redis.call("GET", KEYS[2])
if not sessionRaw then return {0} end
local session = cjson.decode(sessionRaw)
if tonumber(session.expiresAt) <= tonumber(ARGV[3]) or tonumber(session.hardExpiresAt) <= tonumber(ARGV[3]) then return {0} end
local created = redis.call("SET", KEYS[1], ARGV[1], "EX", ARGV[2], "NX")
if not created then return {-1} end
return {1}
`;

const mutateScript = `
local sessionRaw = redis.call("GET", KEYS[2])
if not sessionRaw then return {"expired", false} end
local session = cjson.decode(sessionRaw)
if tonumber(session.expiresAt) <= tonumber(ARGV[6]) or tonumber(session.hardExpiresAt) <= tonumber(ARGV[6]) then return {"expired", false} end
local raw = redis.call("GET", KEYS[1])
if not raw then return {"missing", false} end
local record = cjson.decode(raw)
if record.schemaVersion ~= 1 or record.ownerId ~= ARGV[1] then return {"missing", false} end
if record.lastMutationId == ARGV[3] then return {"idempotent", raw} end
if tonumber(record.data.revision) ~= tonumber(ARGV[2]) then return {"conflict", raw} end
redis.call("SET", KEYS[1], ARGV[4], "EX", ARGV[5])
return {"saved", ARGV[4]}
`;

function decodeRecord(value: unknown): StoredDocument | null {
  try {
    const parsed = typeof value === "string" ? JSON.parse(value) as unknown : value;
    if (
      typeof parsed !== "object" ||
      parsed === null ||
      !("schemaVersion" in parsed) ||
      parsed.schemaVersion !== 1 ||
      !("ownerId" in parsed) ||
      typeof parsed.ownerId !== "string" ||
      !("lastMutationId" in parsed) ||
      (parsed.lastMutationId !== null && typeof parsed.lastMutationId !== "string") ||
      !("data" in parsed)
    ) {
      return null;
    }
    const data = storedReviewDocumentSchema.safeParse(parsed.data);
    if (!data.success) return null;
    return {
      schemaVersion: 1,
      ownerId: parsed.ownerId,
      lastMutationId: parsed.lastMutationId,
      data: data.data,
    };
  } catch {
    return null;
  }
}

function decodeScriptResult(value: unknown): { status: string; record: StoredDocument | null } {
  if (!Array.isArray(value) || typeof value[0] !== "string") {
    throw new StorageUnavailableError();
  }
  return { status: value[0], record: value[1] === false ? null : decodeRecord(value[1]) };
}

function publicDocument(record: StoredDocument): ReviewDocument {
  return record.data;
}

export class RedisDocumentReviewStore implements DocumentReviewStore {
  constructor(private readonly sessions: SessionStore) {}

  async create(input: CreateReviewDocumentInput): Promise<ReviewDocument> {
    try {
      const now = Date.now();
      const session = await this.sessions.get(input.ownerId, now);
      if (!session) throw new StorageUnavailableError();
      const expiresAt = Math.min(input.expiresAt, session.expiresAt);
      const ttlSeconds = Math.floor((expiresAt - now) / 1_000);
      if (ttlSeconds <= 0) throw new StorageUnavailableError();
      const data: ReviewDocument = {
        metadata: input.metadata,
        questions: input.questions,
        warnings: input.warnings,
        revision: 0,
        confirmed: false,
        expiresAt,
      };
      const record: StoredDocument = {
        schemaVersion: 1,
        ownerId: input.ownerId,
        lastMutationId: null,
        data,
      };
      this.assertSize(record);
      const created = await getRedisClient().eval<
        [string, string, string],
        [number]
      >(
        createScript,
        [documentKey(input.metadata.id), sessionKey(input.ownerId)],
        [JSON.stringify(record), String(ttlSeconds), String(now)],
      );
      if (created[0] !== 1) throw new StorageUnavailableError();
      return data;
    } catch (error) {
      if (error instanceof StorageUnavailableError) throw error;
      throw new StorageUnavailableError();
    }
  }

  async getOwned(documentId: string, ownerId: string): Promise<ReviewDocument | null> {
    try {
      const now = Date.now();
      const session = await this.sessions.getAndTouch(ownerId, now);
      if (!session) return null;
      const ttlSeconds = Math.max(1, Math.floor((session.expiresAt - now) / 1_000));
      const value = await getRedisClient().eval<
        [string, string, string, string],
        [unknown]
      >(
        getOwnedScript,
        [documentKey(documentId), sessionKey(ownerId)],
        [ownerId, String(session.expiresAt), String(ttlSeconds), String(now)],
      );
      if (!value[0]) return null;
      const record = decodeRecord(value[0]);
      if (!record) throw new StorageUnavailableError();
      return publicDocument(record);
    } catch (error) {
      if (error instanceof StorageUnavailableError) throw error;
      throw new StorageUnavailableError();
    }
  }

  async updateQuestion(
    documentId: string,
    ownerId: string,
    questionId: string,
    expectedRevision: number,
    mutationId: string,
    question: Pick<MultipleChoiceQuestion, "prompt" | "options" | "correctOption">,
  ): Promise<ReviewMutationResult> {
    return this.mutate(documentId, ownerId, expectedRevision, mutationId, (document) => {
      const questionIndex = document.questions.findIndex((item) => item.id === questionId);
      if (questionIndex < 0) return null;
      const questions = [...document.questions];
      questions[questionIndex] = applyQuestionEdits(questions[questionIndex], question);
      return { ...document, questions, confirmed: false };
    });
  }

  async removeQuestion(
    documentId: string,
    ownerId: string,
    questionId: string,
    expectedRevision: number,
    mutationId: string,
  ): Promise<ReviewMutationResult> {
    return this.mutate(documentId, ownerId, expectedRevision, mutationId, (document) => {
      const questions = document.questions.filter((item) => item.id !== questionId);
      return questions.length === document.questions.length
        ? null
        : { ...document, questions, confirmed: false };
    });
  }

  async confirm(
    documentId: string,
    ownerId: string,
    expectedRevision: number,
    mutationId: string,
  ): Promise<ReviewMutationResult> {
    return this.mutate(
      documentId,
      ownerId,
      expectedRevision,
      mutationId,
      (document) => ({ ...document, confirmed: true }),
    );
  }

  private async mutate(
    documentId: string,
    ownerId: string,
    expectedRevision: number,
    mutationId: string,
    update: (document: ReviewDocument) => ReviewDocument | null,
  ): Promise<ReviewMutationResult> {
    try {
      const now = Date.now();
      const session = await this.sessions.getAndTouch(ownerId, now);
      if (!session) return { status: "missing" };
      const ttlSeconds = Math.max(1, Math.floor((session.expiresAt - now) / 1_000));
      const currentValue = await getRedisClient().get<unknown>(documentKey(documentId));
      const current = decodeRecord(currentValue);
      if (!current || current.ownerId !== ownerId) return { status: "missing" };
      if (current.lastMutationId === mutationId) {
        return { status: "saved", document: current.data, idempotent: true };
      }
      if (current.data.revision !== expectedRevision) {
        return { status: "conflict", document: current.data };
      }
      const nextData = update(current.data);
      if (!nextData) return { status: "missing" };
      nextData.expiresAt = Math.min(session.expiresAt, now + ttlSeconds * 1_000);
      nextData.revision = current.data.revision + 1;
      const next: StoredDocument = {
        schemaVersion: 1,
        ownerId,
        lastMutationId: mutationId,
        data: nextData,
      };
      this.assertSize(next);
      const result = decodeScriptResult(
        await getRedisClient().eval<
          [string, string, string, string, string, string],
          [string, unknown]
        >(
          mutateScript,
          [documentKey(documentId), sessionKey(ownerId)],
          [
            ownerId,
            String(expectedRevision),
            mutationId,
            JSON.stringify(next),
            String(ttlSeconds),
            String(now),
          ],
        ),
      );
      if (result.status === "saved" && result.record) {
        return { status: "saved", document: result.record.data, idempotent: false };
      }
      if (result.status === "idempotent" && result.record) {
        return { status: "saved", document: result.record.data, idempotent: true };
      }
      if (result.status === "conflict" && result.record) {
        return { status: "conflict", document: result.record.data };
      }
      return { status: "missing" };
    } catch (error) {
      if (
        error instanceof StorageUnavailableError ||
        error instanceof StorageRecordTooLargeError
      ) throw error;
      throw new StorageUnavailableError();
    }
  }

  private assertSize(record: StoredDocument) {
    const size = new TextEncoder().encode(JSON.stringify(record)).byteLength;
    if (size > getTemporaryStorageConfig().maxRecordBytes) {
      throw new StorageRecordTooLargeError();
    }
  }
}
