import type {
  AssessmentMutationResult,
  AssessmentStore,
  CreateAssessmentInput,
  CreateAssessmentResult,
} from "@/application/ports/assessment-store";
import type { SessionStore } from "@/application/ports/session-store";
import type { AssessmentRecord } from "@/domain/assessment";
import {
  finalizeAssessment,
  getSubmissionSummary,
} from "@/domain/assessment";
import type { AnswerOptionId } from "@/domain/question";
import { getTemporaryStorageConfig } from "@/application/config/temporary-storage";
import { getRedisClient } from "@/infrastructure/storage/redis-client";
import {
  StorageRecordTooLargeError,
  StorageUnavailableError,
} from "@/infrastructure/storage/storage-error";
import { storedAssessmentRecordSchema } from "@/infrastructure/storage/storage-schemas";

type StoredAssessment = {
  schemaVersion: 1;
  data: AssessmentRecord;
};

const assessmentKey = (id: string) => `mcqforge:v1:test:${id}`;
const sessionKey = (id: string) => `mcqforge:v1:session:${id}`;
const requestKey = (ownerId: string, requestId: string) =>
  `mcqforge:v1:test-request:${ownerId}:${requestId}`;

const createScript = `
local sessionRaw = redis.call("GET", KEYS[3])
if not sessionRaw then return {"expired", false} end
local session = cjson.decode(sessionRaw)
if tonumber(session.expiresAt) <= tonumber(ARGV[5]) or tonumber(session.hardExpiresAt) <= tonumber(ARGV[5]) then return {"expired", false} end
local priorId = redis.call("GET", KEYS[2])
if priorId then
  local priorKey = ARGV[1] .. priorId
  local prior = redis.call("GET", priorKey)
  if prior then
    redis.call("EXPIRE", KEYS[2], ARGV[3])
    redis.call("EXPIRE", priorKey, ARGV[3])
    return {"duplicate", prior}
  end
  redis.call("DEL", KEYS[2])
end
if redis.call("EXISTS", KEYS[1]) == 1 then return {"conflict", false} end
redis.call("SET", KEYS[1], ARGV[2], "EX", ARGV[3], "NX")
redis.call("SET", KEYS[2], ARGV[4], "EX", ARGV[3])
return {"created", ARGV[2]}
`;

const getOwnedScript = `
local sessionRaw = redis.call("GET", KEYS[2])
if not sessionRaw then return {false} end
local session = cjson.decode(sessionRaw)
if tonumber(session.expiresAt) <= tonumber(ARGV[4]) or tonumber(session.hardExpiresAt) <= tonumber(ARGV[4]) then return {false} end
local raw = redis.call("GET", KEYS[1])
if not raw then return {false} end
local record = cjson.decode(raw)
if record.schemaVersion ~= 1 or record.data.ownerId ~= ARGV[1] then return {false} end
record.data.expiresAt = tonumber(ARGV[2])
local updated = cjson.encode(record)
redis.call("SET", KEYS[1], updated, "EX", ARGV[3])
return {updated}
`;

const compareAndSetScript = `
local sessionRaw = redis.call("GET", KEYS[2])
if not sessionRaw then return {"expired", false} end
local session = cjson.decode(sessionRaw)
if tonumber(session.expiresAt) <= tonumber(ARGV[5]) or tonumber(session.hardExpiresAt) <= tonumber(ARGV[5]) then return {"expired", false} end
local raw = redis.call("GET", KEYS[1])
if not raw then return {"missing", false} end
local current = cjson.decode(raw)
if current.schemaVersion ~= 1 or current.data.ownerId ~= ARGV[1] then return {"missing", false} end
if current.data.status == "submitted" then return {"submitted", raw} end
if tonumber(current.data.revision) ~= tonumber(ARGV[2]) then return {"conflict", raw} end
redis.call("SET", KEYS[1], ARGV[3], "EX", ARGV[4])
return {"saved", ARGV[3]}
`;

function decodeAssessment(value: unknown): AssessmentRecord | null {
  try {
    const parsed = typeof value === "string" ? JSON.parse(value) as unknown : value;
    if (
      typeof parsed !== "object" ||
      parsed === null ||
      !("schemaVersion" in parsed) ||
      parsed.schemaVersion !== 1 ||
      !("data" in parsed)
    ) {
      return null;
    }
    const result = storedAssessmentRecordSchema.safeParse(parsed.data);
    return result.success ? result.data : null;
  } catch {
    return null;
  }
}

function decodeScriptResult(value: unknown): { status: string; assessment: AssessmentRecord | null } {
  if (!Array.isArray(value) || typeof value[0] !== "string") {
    throw new StorageUnavailableError();
  }
  return { status: value[0], assessment: value[1] === false ? null : decodeAssessment(value[1]) };
}

function stored(assessment: AssessmentRecord): StoredAssessment {
  return { schemaVersion: 1, data: assessment };
}

export class RedisAssessmentStore implements AssessmentStore {
  constructor(private readonly sessions: SessionStore) {}

  async create(input: CreateAssessmentInput): Promise<CreateAssessmentResult> {
    try {
      const now = Date.now();
      const session = await this.sessions.get(input.ownerId, now);
      if (!session) return { status: "session_unavailable" };
      const expiresAt = Math.min(input.expiresAt, session.expiresAt);
      const ttlSeconds = Math.floor((expiresAt - now) / 1_000);
      if (ttlSeconds <= 0) return { status: "session_unavailable" };
      const assessment = { ...input, expiresAt };
      const payload = stored(assessment);
      this.assertSize(payload);
      const response = await getRedisClient().eval<
        [string, string, string, string, string],
        [string, unknown]
      >(
        createScript,
        [assessmentKey(assessment.id), requestKey(assessment.ownerId, assessment.requestId), sessionKey(assessment.ownerId)],
        [
          "mcqforge:v1:test:",
          JSON.stringify(payload),
          String(ttlSeconds),
          assessment.id,
          String(now),
        ],
      );
      if (!Array.isArray(response) || typeof response[0] !== "string") {
        throw new StorageUnavailableError();
      }
      if (response[0] === "expired") return { status: "session_unavailable" };
      if (response[0] === "conflict") return { status: "conflict" };
      const resultAssessment = decodeAssessment(response[1]);
      if (!resultAssessment) throw new StorageUnavailableError();
      if (response[0] === "duplicate") {
        if (
          resultAssessment.documentId !== assessment.documentId ||
          JSON.stringify(resultAssessment.configuration) !==
            JSON.stringify(assessment.configuration)
        ) {
          return { status: "conflict" };
        }
        return { status: "duplicate", assessment: resultAssessment };
      }
      if (response[0] === "created") {
        return { status: "created", assessment: resultAssessment };
      }
      throw new StorageUnavailableError();
    } catch (error) {
      if (
        error instanceof StorageUnavailableError ||
        error instanceof StorageRecordTooLargeError
      ) throw error;
      throw new StorageUnavailableError();
    }
  }

  async getOwned(
    assessmentId: string,
    ownerId: string,
  ): Promise<AssessmentRecord | null> {
    try {
      const now = Date.now();
      const session = await this.sessions.getAndTouch(ownerId, now);
      if (!session) return null;
      const ttlSeconds = Math.max(1, Math.floor((session.expiresAt - now) / 1_000));
      const raw = await getRedisClient().eval<
        [string, string, string, string],
        [unknown]
      >(
        getOwnedScript,
        [assessmentKey(assessmentId), sessionKey(ownerId)],
        [ownerId, String(session.expiresAt), String(ttlSeconds), String(now)],
      );
      const assessment = raw[0] ? decodeAssessment(raw[0]) : null;
      if (raw[0] && !assessment) throw new StorageUnavailableError();
      if (
        assessment?.status === "in_progress" &&
        assessment.deadline !== null &&
        now >= assessment.deadline
      ) {
        const submitted = await this.submit(assessmentId, ownerId, now);
        return submitted.status === "submitted" ? submitted.assessment : null;
      }
      return assessment;
    } catch (error) {
      if (
        error instanceof StorageUnavailableError ||
        error instanceof StorageRecordTooLargeError
      ) throw error;
      throw new StorageUnavailableError();
    }
  }

  async updateAnswer(
    assessmentId: string,
    ownerId: string,
    questionId: string,
    answer: AnswerOptionId,
    expectedRevision: number,
    mutationId: string,
    now: number,
    retry = 0,
  ): Promise<AssessmentMutationResult> {
    try {
      const session = await this.sessions.getAndTouch(ownerId, now);
      if (!session) return { status: "not_found" };
      const current = await this.readOwned(assessmentId, ownerId, session);
      if (!current) return { status: "not_found" };
      if (current.status === "submitted") {
        return this.submittedResult(current, false);
      }
      if (current.deadline !== null && now >= current.deadline) {
        const final = {
          ...finalizeAssessment(current, now, true),
          expiresAt: session.expiresAt,
        };
        const saved = await this.compareAndSet(current, ownerId, session, final);
        if (saved.status === "conflict") {
          if (retry >= 4) {
            return saved.assessment
              ? { status: "conflict", assessment: saved.assessment }
              : { status: "not_found" };
          }
          return this.updateAnswer(
            assessmentId,
            ownerId,
            questionId,
            answer,
            expectedRevision,
            mutationId,
            now,
            retry + 1,
          );
        }
        if (saved.status === "submitted" && saved.assessment) {
          return this.submittedResult(saved.assessment, false);
        }
        return { status: "not_found" };
      }
      if (!current.questions.some((question) => question.id === questionId)) {
        return { status: "missing" };
      }
      if (current.lastMutationId === mutationId) {
        return { status: "saved", assessment: current, idempotent: true };
      }
      if (current.revision !== expectedRevision) {
        return { status: "conflict", assessment: current };
      }
      const next: AssessmentRecord = {
        ...current,
        answers: { ...current.answers, [questionId]: answer },
        revision: current.revision + 1,
        lastMutationId: mutationId,
        expiresAt: session.expiresAt,
      };
      const saved = await this.compareAndSet(current, ownerId, session, next);
      if (saved.status === "saved" && saved.assessment) {
        return { status: "saved", assessment: saved.assessment, idempotent: false };
      }
      if (saved.status === "conflict" && saved.assessment) {
        return { status: "conflict", assessment: saved.assessment };
      }
      if (saved.status === "submitted" && saved.assessment) {
        return this.submittedResult(saved.assessment, false);
      }
      return { status: "not_found" };
    } catch (error) {
      if (
        error instanceof StorageUnavailableError ||
        error instanceof StorageRecordTooLargeError
      ) throw error;
      throw new StorageUnavailableError();
    }
  }

  async submit(
    assessmentId: string,
    ownerId: string,
    now: number,
  ): Promise<AssessmentMutationResult> {
    try {
      const session = await this.sessions.getAndTouch(ownerId, now);
      if (!session) return { status: "not_found" };
      for (let attempt = 0; attempt < 4; attempt += 1) {
        const current = await this.readOwned(assessmentId, ownerId, session);
        if (!current) return { status: "not_found" };
        if (current.status === "submitted") return this.submittedResult(current, true);
        const timedOut = current.deadline !== null && now >= current.deadline;
        const finalized = {
          ...finalizeAssessment(current, now, timedOut),
          expiresAt: session.expiresAt,
        };
        const saved = await this.compareAndSet(current, ownerId, session, finalized);
        if (saved.status === "saved" && saved.assessment) {
          return this.submittedResult(saved.assessment, false);
        }
        if (saved.status === "submitted" && saved.assessment) {
          return this.submittedResult(saved.assessment, true);
        }
        if (saved.status === "missing" || saved.status === "expired") {
          return { status: "not_found" };
        }
      }
      const latest = await this.readOwned(assessmentId, ownerId, session);
      return latest
        ? { status: "conflict", assessment: latest }
        : { status: "not_found" };
    } catch (error) {
      if (
        error instanceof StorageUnavailableError ||
        error instanceof StorageRecordTooLargeError
      ) throw error;
      throw new StorageUnavailableError();
    }
  }

  private async readOwned(
    assessmentId: string,
    ownerId: string,
    session: { expiresAt: number },
  ): Promise<AssessmentRecord | null> {
    const now = Date.now();
    const ttlSeconds = Math.max(1, Math.floor((session.expiresAt - now) / 1_000));
    const value = await getRedisClient().eval<
      [string, string, string, string],
      [unknown]
    >(
      getOwnedScript,
      [assessmentKey(assessmentId), sessionKey(ownerId)],
      [ownerId, String(session.expiresAt), String(ttlSeconds), String(now)],
    );
    if (!value[0]) return null;
    const assessment = decodeAssessment(value[0]);
    if (!assessment) throw new StorageUnavailableError();
    return assessment;
  }

  private async compareAndSet(
    current: AssessmentRecord,
    ownerId: string,
    session: { expiresAt: number },
    next: AssessmentRecord,
  ): Promise<{ status: string; assessment: AssessmentRecord | null }> {
    const now = Date.now();
    const ttlSeconds = Math.max(1, Math.floor((session.expiresAt - now) / 1_000));
    const payload = stored(next);
    this.assertSize(payload);
    const result = await getRedisClient().eval<
      [string, string, string, string, string],
      [string, unknown]
    >(
      compareAndSetScript,
      [assessmentKey(current.id), sessionKey(ownerId)],
      [ownerId, String(current.revision), JSON.stringify(payload), String(ttlSeconds), String(now)],
    );
    return decodeScriptResult(result);
  }

  private submittedResult(
    assessment: AssessmentRecord,
    idempotent: boolean,
  ): AssessmentMutationResult {
    return {
      status: "submitted",
      assessment,
      summary: getSubmissionSummary(
        assessment,
        assessment.result?.timedOut ?? false,
      ),
      idempotent,
    };
  }

  private assertSize(payload: StoredAssessment) {
    const size = new TextEncoder().encode(JSON.stringify(payload)).byteLength;
    if (size > getTemporaryStorageConfig().maxRecordBytes) {
      throw new StorageRecordTooLargeError();
    }
  }
}
