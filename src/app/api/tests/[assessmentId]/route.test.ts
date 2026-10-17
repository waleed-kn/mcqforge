import { randomUUID } from "node:crypto";
import { describe, expect, it } from "vitest";
import { NextRequest } from "next/server";
import { createAssessmentRecord } from "@/application/services/create-assessment";
import { getAssessmentStore } from "@/infrastructure/storage/assessment-store";
import { activeAssessmentSchema } from "@/validation/assessment";
import { GET, PATCH, POST } from "./route";
import { GET as GET_RESULT } from "./result/route";

function createRequest(
  assessmentId: string,
  ownerId: string,
  method: string,
  body?: unknown,
) {
  return new NextRequest(`http://localhost/api/tests/${assessmentId}`, {
    method,
    headers: {
      cookie: `mcqforge_session=${ownerId}`,
      ...(body === undefined ? {} : { "content-type": "application/json" }),
    },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
}

function context(assessmentId: string) {
  return { params: Promise.resolve({ assessmentId }) };
}

async function createRecord(deadline: number | null = null) {
  const ownerId = randomUUID();
  const questionId = randomUUID();
  const record = createAssessmentRecord({
    id: randomUUID(),
    ownerId,
    documentId: randomUUID(),
    requestId: randomUUID(),
    configuration:
      deadline === null
        ? { questionCount: 1, mode: "untimed" }
        : { questionCount: 1, mode: "timed", durationMinutes: 15 },
    availableQuestions: [{
      id: questionId,
      sourceNumber: "1",
      sourcePageNumbers: [],
      prompt: "Pick an answer",
      options: { A: "One", B: "Two", C: "Three", D: "Four" },
      correctOption: "B",
      sourceText: "",
      issues: [],
      status: "valid",
    }],
    now: Date.now(),
  });
  const assessment = {
    ...record,
    deadline,
  };
  await getAssessmentStore().create(assessment);
  return { ownerId, assessment, questionId };
}

describe("assessment mutation API", () => {
  it("saves validated answers, returns them after reload, and never exposes answer keys", async () => {
    const { ownerId, assessment, questionId } = await createRecord();
    const body = {
      questionId,
      answer: "C",
      expectedRevision: 0,
      mutationId: randomUUID(),
    };
    const response = await PATCH(
      createRequest(assessment.id, ownerId, "PATCH", body),
      context(assessment.id),
    );
    expect(response.status).toBe(200);
    const saved = await response.json();
    expect(saved.assessment.answers[questionId]).toBe("C");
    expect(saved.assessment.questions[0]).not.toHaveProperty("correctOption");

    const loaded = await GET(
      createRequest(assessment.id, ownerId, "GET"),
      context(assessment.id),
    );
    const loadedBody = await loaded.json();
    const active = activeAssessmentSchema.parse(loadedBody.assessment);
    expect(active.answers[questionId]).toBe("C");
    expect(active.questions[0]).not.toHaveProperty("correctOption");
  });

  it("rejects invalid answer payloads and owner-mismatched requests", async () => {
    const { ownerId, assessment, questionId } = await createRecord();
    const invalid = await PATCH(
      createRequest(assessment.id, ownerId, "PATCH", {
        questionId,
        answer: "E",
        expectedRevision: 0,
        mutationId: randomUUID(),
      }),
      context(assessment.id),
    );
    expect(invalid.status).toBe(400);

    const unauthorized = await PATCH(
      createRequest(assessment.id, randomUUID(), "PATCH", {
        questionId,
        answer: "A",
        expectedRevision: 0,
        mutationId: randomUUID(),
      }),
      context(assessment.id),
    );
    expect(unauthorized.status).toBe(410);
  });

  it("submits manually once, returns the same summary on retry, and rejects answer edits after finalization", async () => {
    const { ownerId, assessment, questionId } = await createRecord();
    const answer = await PATCH(
      createRequest(assessment.id, ownerId, "PATCH", {
        questionId,
        answer: "D",
        expectedRevision: 0,
        mutationId: randomUUID(),
      }),
      context(assessment.id),
    );
    expect(answer.status).toBe(200);

    const first = await POST(
      createRequest(assessment.id, ownerId, "POST", {
        score: 100,
        correctAnswers: 1,
        correctOption: "D",
      }),
      context(assessment.id),
    );
    const firstBody = await first.json();
    expect(first.status).toBe(201);
    expect(firstBody.summary).toMatchObject({ answered: 1, unanswered: 0 });
    expect(firstBody.result).toMatchObject({
      correct: 0,
      incorrect: 1,
      unanswered: 0,
      percentage: 0,
      questions: [{ userAnswer: "D", correctAnswer: "B", outcome: "incorrect" }],
    });
    const repeated = await POST(
      createRequest(assessment.id, ownerId, "POST", {}),
      context(assessment.id),
    );
    const repeatedBody = await repeated.json();
    expect(repeated.status).toBe(200);
    expect(repeatedBody.idempotent).toBe(true);
    expect(repeatedBody.summary).toEqual(firstBody.summary);
    expect(repeatedBody.result).toEqual(firstBody.result);

    const submittedTestReload = await GET(
      createRequest(assessment.id, ownerId, "GET"),
      context(assessment.id),
    );
    const submittedTestBody = await submittedTestReload.json();
    expect(submittedTestBody.assessment.status).toBe("submitted");
    expect(submittedTestBody).not.toHaveProperty("result");
    expect(submittedTestBody.assessment.questions[0]).not.toHaveProperty("correctOption");

    const afterSubmit = await PATCH(
      createRequest(assessment.id, ownerId, "PATCH", {
        questionId,
        answer: "A",
        expectedRevision: 1,
        mutationId: randomUUID(),
      }),
      context(assessment.id),
    );
    expect(afterSubmit.status).toBe(409);
    expect((await afterSubmit.json()).assessment.answers[questionId]).toBe("D");
  });

  it("timeout submission includes only answers already stored on the server", async () => {
    const { ownerId, assessment } = await createRecord(Date.now() - 1);
    const response = await POST(
      createRequest(assessment.id, ownerId, "POST", {}),
      context(assessment.id),
    );
    const body = await response.json();
    expect(body.summary).toMatchObject({
      answered: 0,
      unanswered: 1,
      timedOut: true,
    });
    expect(body.assessment.status).toBe("submitted");
    expect(body.result).toMatchObject({
      correct: 0,
      unanswered: 1,
      timedOut: true,
    });
  });

  it("protects results until submission and enforces ownership", async () => {
    const { ownerId, assessment } = await createRecord();
    const activeResult = await GET_RESULT(
      createRequest(assessment.id, ownerId, "GET"),
      context(assessment.id),
    );
    expect(activeResult.status).toBe(409);

    await POST(
      createRequest(assessment.id, ownerId, "POST", {}),
      context(assessment.id),
    );
    const resultResponse = await GET_RESULT(
      createRequest(assessment.id, ownerId, "GET"),
      context(assessment.id),
    );
    expect(resultResponse.status).toBe(200);
    expect((await resultResponse.json()).result.totalQuestions).toBe(1);

    const unauthorized = await GET_RESULT(
      createRequest(assessment.id, randomUUID(), "GET"),
      context(assessment.id),
    );
    expect(unauthorized.status).toBe(410);
  });

  it("returns 410 for invalid or expired assessment identifiers", async () => {
    const response = await GET_RESULT(
      createRequest(randomUUID(), randomUUID(), "GET"),
      context(randomUUID()),
    );
    expect(response.status).toBe(410);
  });
});
