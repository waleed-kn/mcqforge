import { randomUUID } from "node:crypto";
import { describe, expect, it } from "vitest";
import { NextRequest } from "next/server";
import { POST as confirmReview } from "./confirm/route";
import { GET as getReview } from "./route";
import {
  DELETE as removeQuestion,
  PATCH as updateQuestion,
} from "./questions/[questionId]/route";
import { getDocumentReviewStore } from "@/infrastructure/storage/document-review-store";
import { getSessionStore } from "@/infrastructure/storage/session-store";
import type { CreateReviewDocumentInput } from "@/application/ports/document-review-store";
import type { MultipleChoiceQuestion } from "@/domain/question";

function createQuestion(
  overrides: Partial<MultipleChoiceQuestion> = {},
): MultipleChoiceQuestion {
  return {
    id: randomUUID(),
    sourceNumber: "1",
    sourcePageNumbers: [],
    prompt: "Choose a color",
    options: { A: "Red", B: "Blue", C: "Green", D: "White" },
    correctOption: "B",
    sourceText: "source question",
    issues: [],
    status: "valid",
    ...overrides,
  };
}

async function createReviewDocument(question: MultipleChoiceQuestion) {
  const ownerId = randomUUID();
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
    questions: [question],
    warnings: [],
    expiresAt: Date.now() + 60_000,
  };
  await getDocumentReviewStore().create(input);
  return input;
}

function createJsonRequest(url: string, method: string, ownerId: string, body?: unknown) {
  return new NextRequest(url, {
    method,
    headers: {
      cookie: `mcqforge_session=${ownerId}`,
      "content-type": "application/json",
      origin: new URL(url).origin,
    },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
}

const documentContext = (documentId: string) => ({
  params: Promise.resolve({ documentId }),
});

const questionContext = (documentId: string, questionId: string) => ({
  params: Promise.resolve({ documentId, questionId }),
});

describe("document review API", () => {
  it("returns review questions only to the owning session", async () => {
    const question = createQuestion();
    const document = await createReviewDocument(question);
    const ownerRequest = createJsonRequest(
      `http://localhost/api/documents/parse/${document.metadata.id}`,
      "GET",
      document.ownerId,
    );
    const ownerResponse = await getReview(ownerRequest, documentContext(document.metadata.id));
    expect(ownerResponse.status).toBe(200);
    expect((await ownerResponse.json()).questions[0].correctOption).toBe("B");

    const otherOwnerId = randomUUID();
    await getSessionStore().create(otherOwnerId, Date.now());
    const otherRequest = createJsonRequest(
      `http://localhost/api/documents/parse/${document.metadata.id}`,
      "GET",
      otherOwnerId,
    );
    const otherResponse = await getReview(otherRequest, documentContext(document.metadata.id));
    expect(otherResponse.status).toBe(410);
  });

  it("validates edit payloads on the server and permits similar option values", async () => {
    const question = createQuestion();
    const document = await createReviewDocument(question);
    const request = createJsonRequest(
      `http://localhost/api/documents/parse/${document.metadata.id}/questions/${question.id}`,
      "PATCH",
      document.ownerId,
      {
        expectedRevision: 0,
        mutationId: randomUUID(),
        question: {
          prompt: "  Updated prompt  ",
          options: { A: "Same", B: "Same", C: "Third", D: "Fourth" },
          correctOption: "B",
        },
      },
    );
    const response = await updateQuestion(
      request,
      questionContext(document.metadata.id, question.id),
    );
    const body = await response.json();
    expect(response.status).toBe(200);
    expect(body.document.questions[0]).toMatchObject({
      prompt: "Updated prompt",
      options: { A: "Same", B: "Same" },
      correctOption: "B",
      status: "valid",
    });

    const invalidRequest = createJsonRequest(
      `http://localhost/api/documents/parse/${document.metadata.id}/questions/${question.id}`,
      "PATCH",
      document.ownerId,
      {
        expectedRevision: 1,
        mutationId: randomUUID(),
        question: {
          prompt: "x".repeat(20_001),
          options: { A: "A", B: "B", C: "C", D: "D" },
          correctOption: "A",
        },
      },
    );
    const invalidResponse = await updateQuestion(
      invalidRequest,
      questionContext(document.metadata.id, question.id),
    );
    expect(invalidResponse.status).toBe(400);
    expect((await invalidResponse.json()).error.code).toBe("invalid_edits");
  });

  it("treats duplicate saves as idempotent and reports stale revisions", async () => {
    const question = createQuestion();
    const document = await createReviewDocument(question);
    const mutationId = randomUUID();
    const body = {
      expectedRevision: 0,
      mutationId,
      question: {
        prompt: "Saved once",
        options: question.options,
        correctOption: "A",
      },
    };

    const first = await updateQuestion(
      createJsonRequest("http://localhost/api/documents/parse", "PATCH", document.ownerId, body),
      questionContext(document.metadata.id, question.id),
    );
    const repeated = await updateQuestion(
      createJsonRequest("http://localhost/api/documents/parse", "PATCH", document.ownerId, body),
      questionContext(document.metadata.id, question.id),
    );
    expect(first.status).toBe(200);
    expect((await repeated.json()).idempotent).toBe(true);

    const stale = await updateQuestion(
      createJsonRequest(
        "http://localhost/api/documents/parse",
        "PATCH",
        document.ownerId,
        { ...body, mutationId: randomUUID() },
      ),
      questionContext(document.metadata.id, question.id),
    );
    expect(stale.status).toBe(409);
  });

  it("blocks confirmation with no valid questions and allows removal of the final question", async () => {
    const question = createQuestion({
      correctOption: null,
      status: "needs_review",
    });
    const document = await createReviewDocument(question);
    const confirmBody = {
      expectedRevision: 0,
      mutationId: randomUUID(),
    };
    const blocked = await confirmReview(
      createJsonRequest("http://localhost/api/documents/parse", "POST", document.ownerId, confirmBody),
      documentContext(document.metadata.id),
    );
    expect(blocked.status).toBe(422);

    const removed = await removeQuestion(
      createJsonRequest(
        `http://localhost/api/documents/parse/${document.metadata.id}/questions/${question.id}`,
        "DELETE",
        document.ownerId,
        { expectedRevision: 0, mutationId: randomUUID() },
      ),
      questionContext(document.metadata.id, question.id),
    );
    expect(removed.status).toBe(200);
    expect((await removed.json()).document.questions).toEqual([]);
  });
});
