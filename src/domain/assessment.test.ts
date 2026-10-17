import { randomUUID } from "node:crypto";
import { describe, expect, it } from "vitest";
import type { AssessmentRecord } from "./assessment";
import {
  moveAssessmentQuestion,
  toActiveAssessment,
  transitionAssessment,
} from "./assessment";

function makeAssessment(): AssessmentRecord {
  return {
    id: randomUUID(),
    ownerId: randomUUID(),
    documentId: randomUUID(),
    requestId: randomUUID(),
    configuration: { questionCount: 1, mode: "untimed" },
    questions: [{
      id: randomUUID(),
      sourceNumber: null,
      sourcePageNumbers: [],
      prompt: "Pick one",
      options: { A: "A", B: "B", C: "C", D: "D" },
      correctOption: "B",
    }],
    answers: {},
    revision: 0,
    lastMutationId: null,
    status: "in_progress",
    createdAt: 100,
    startedAt: 100,
    deadline: null,
    submittedAt: null,
    expiresAt: 10_000,
  };
}

describe("assessment domain", () => {
  it("navigates adjacent questions without moving beyond the test boundaries", () => {
    expect(moveAssessmentQuestion(0, 3, -1)).toBe(0);
    expect(moveAssessmentQuestion(0, 3, 1)).toBe(1);
    expect(moveAssessmentQuestion(2, 3, 1)).toBe(2);
    expect(moveAssessmentQuestion(1, 0, -1)).toBe(0);
  });

  it("removes correct answers from the active test representation", () => {
    const active = toActiveAssessment(makeAssessment());
    expect(active.questions[0]).not.toHaveProperty("correctOption");
    expect(JSON.stringify(active)).not.toContain("correctOption");
  });

  it("allows submission from in_progress and rejects invalid repeated transitions", () => {
    const assessment = makeAssessment();
    const submitted = transitionAssessment(assessment, "submitted", 200);
    expect(submitted).toMatchObject({ ok: true, assessment: { status: "submitted" } });
    if (!submitted.ok) throw new Error("Expected a valid submission transition.");
    expect(transitionAssessment(submitted.assessment, "submitted", 300)).toMatchObject({
      ok: true,
      idempotent: true,
    });
    expect(transitionAssessment(assessment, "in_progress", 200)).toMatchObject({
      ok: false,
      reason: "unsupported_transition",
    });
  });
});
