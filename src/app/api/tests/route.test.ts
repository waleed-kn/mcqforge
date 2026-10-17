import { randomUUID } from "node:crypto";
import { describe, expect, it } from "vitest";
import { NextRequest } from "next/server";
import { POST as startAssessment } from "./route";
import { GET as getAssessment } from "./[assessmentId]/route";
import { getDocumentReviewStore } from "@/infrastructure/storage/document-review-store";
import type { CreateReviewDocumentInput } from "@/application/ports/document-review-store";
import type { MultipleChoiceQuestion } from "@/domain/question";
import { activeAssessmentSchema } from "@/validation/assessment";
import { getSessionStore } from "@/infrastructure/storage/session-store";

function makeQuestion(overrides: Partial<MultipleChoiceQuestion> = {}): MultipleChoiceQuestion {
  return {
    id: randomUUID(),
    sourceNumber: "1",
    sourcePageNumbers: [],
    prompt: "Choose the prime number",
    options: { A: "4", B: "5", C: "6", D: "8" },
    correctOption: "B",
    sourceText: "",
    issues: [],
    status: "valid",
    ...overrides,
  };
}

async function createConfirmedDocument(
  ownerId = randomUUID(),
  questions = [makeQuestion()],
) {
  await getSessionStore().create(ownerId, Date.now());
  const input: CreateReviewDocumentInput = {
    ownerId,
    metadata: {
      id: randomUUID(),
      fileName: "questions.txt",
      mediaType: "text/plain",
      extension: "txt",
      sizeBytes: 100,
    },
    questions,
    warnings: [],
    expiresAt: Date.now() + 60_000,
  };
  const store = getDocumentReviewStore();
  await store.create(input);
  await store.confirm(input.metadata.id, ownerId, 0, randomUUID());
  return input;
}

function jsonRequest(ownerId: string, body: unknown) {
  return new NextRequest("http://localhost/api/tests", {
    method: "POST",
    headers: {
      cookie: `mcqforge_session=${ownerId}`,
      "content-type": "application/json",
      origin: "http://localhost",
    },
    body: JSON.stringify(body),
  });
}

const testContext = (assessmentId: string) => ({
  params: Promise.resolve({ assessmentId }),
});

describe("assessment API", () => {
  it("creates an owned stable test without returning correct answers", async () => {
    const ownerId = randomUUID();
    const question = makeQuestion();
    const document = await createConfirmedDocument(ownerId, [question]);
    const body = {
      documentId: document.metadata.id,
      requestId: randomUUID(),
      questionCount: 1,
      mode: "timed",
      durationMinutes: 15,
    };
    const response = await startAssessment(jsonRequest(ownerId, body));
    const responseBody = await response.json();
    const activeAssessment = activeAssessmentSchema.parse(responseBody.assessment);
    expect(response.status).toBe(201);
    expect(activeAssessment).toMatchObject({
      configuration: { questionCount: 1, mode: "timed", durationMinutes: 15 },
      status: "in_progress",
      deadline: activeAssessment.startedAt + 15 * 60_000,
    });
    expect(activeAssessment.questions[0]).not.toHaveProperty("correctOption");

    const reloaded = await getAssessment(
      new NextRequest(`http://localhost/api/tests/${activeAssessment.id}`, {
        headers: { cookie: `mcqforge_session=${ownerId}` },
      }),
      testContext(activeAssessment.id),
    );
    const reloadedBody = await reloaded.json();
    const reloadedAssessment = activeAssessmentSchema.parse(reloadedBody.assessment);
    expect(reloadedAssessment.questions.map((item) => item.id)).toEqual(
      activeAssessment.questions.map((item) => item.id),
    );
  });

  it("rejects manipulated counts, invalid durations, and insufficient available questions", async () => {
    const ownerId = randomUUID();
    const document = await createConfirmedDocument(ownerId, [makeQuestion()]);
    const base = {
      documentId: document.metadata.id,
      requestId: randomUUID(),
      questionCount: 1,
      mode: "untimed",
    };
    const excessive = await startAssessment(
      jsonRequest(ownerId, { ...base, questionCount: 2 }),
    );
    expect(excessive.status).toBe(422);
    expect((await excessive.json()).error.message).toContain("Choose a smaller count");

    const invalidDuration = await startAssessment(
      jsonRequest(ownerId, {
        ...base,
        mode: "timed",
        durationMinutes: 20,
      }),
    );
    expect(invalidDuration.status).toBe(400);

    const overLimit = await startAssessment(
      jsonRequest(ownerId, { ...base, questionCount: 101 }),
    );
    expect(overLimit.status).toBe(400);
  });

  it("requires ownership and safely deduplicates repeated start requests", async () => {
    const ownerId = randomUUID();
    const document = await createConfirmedDocument(ownerId);
    const request = {
      documentId: document.metadata.id,
      requestId: randomUUID(),
      questionCount: 1,
      mode: "untimed",
    };
    const first = await startAssessment(jsonRequest(ownerId, request));
    const firstBody = await first.json();
    const repeated = await startAssessment(jsonRequest(ownerId, request));
    const repeatedBody = await repeated.json();
    expect(repeated.status).toBe(200);
    expect(repeatedBody.idempotent).toBe(true);
    expect(repeatedBody.assessment.id).toBe(firstBody.assessment.id);

    const unauthorized = await startAssessment(jsonRequest(randomUUID(), request));
    expect(unauthorized.status).toBe(401);
    const otherSessionId = randomUUID();
    await getSessionStore().create(otherSessionId, Date.now());
    const activeRequest = new NextRequest(
      `http://localhost/api/tests/${firstBody.assessment.id}`,
      { headers: { cookie: `mcqforge_session=${otherSessionId}` } },
    );
    const unauthorizedRead = await getAssessment(
      activeRequest,
      testContext(firstBody.assessment.id),
    );
    expect(unauthorizedRead.status).toBe(410);
  });

  it("enforces the configured per-session test creation limit", async () => {
    const ownerId = randomUUID();
    const document = await createConfirmedDocument(ownerId);
    const responses = await Promise.all(
      Array.from({ length: 11 }, () =>
        startAssessment(jsonRequest(ownerId, {
          documentId: document.metadata.id,
          requestId: randomUUID(),
          questionCount: 1,
          mode: "untimed",
        })),
      ),
    );
    expect(responses.filter((response) => response.status === 429)).toHaveLength(1);
    expect(responses.filter((response) => response.status === 201)).toHaveLength(10);
  });
});
