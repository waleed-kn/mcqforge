import { randomUUID } from "node:crypto";
import { describe, expect, it } from "vitest";
import type { AssessmentRecord } from "@/domain/assessment";
import { scoreAssessment, AssessmentScoringError } from "./assessment-scoring";

function makeAssessment(
  correctOptions: Array<"A" | "B" | "C" | "D">,
  answers: Record<string, "A" | "B" | "C" | "D"> = {},
): AssessmentRecord {
  const questions = correctOptions.map((correctOption) => ({
    id: randomUUID(),
    sourceNumber: null,
    sourcePageNumbers: [],
    prompt: "Choose one",
    options: { A: "One", B: "Two", C: "Three", D: "Four" },
    correctOption,
  }));
  return {
    id: randomUUID(),
    ownerId: randomUUID(),
    documentId: randomUUID(),
    requestId: randomUUID(),
    configuration: { questionCount: questions.length, mode: "untimed" },
    questions,
    answers,
    revision: 0,
    lastMutationId: null,
    status: "in_progress",
    createdAt: 100,
    startedAt: 100,
    deadline: null,
    submittedAt: null,
    result: null,
    expiresAt: 10_000,
  };
}

describe("scoreAssessment", () => {
  it("scores all unanswered questions as zero and keeps category totals exhaustive", () => {
    const result = scoreAssessment(makeAssessment(["A", "B", "C"]));
    expect(result).toMatchObject({
      correct: 0,
      incorrect: 0,
      unanswered: 3,
      percentage: 0,
      timedOut: false,
    });
    expect(result.correct + result.incorrect + result.unanswered).toBe(3);
  });

  it("scores all correct answers as 100 percent", () => {
    const assessment = makeAssessment(["A", "B"]);
    assessment.answers = Object.fromEntries(
      assessment.questions.map((question) => [question.id, question.correctOption]),
    );
    expect(scoreAssessment(assessment)).toMatchObject({
      correct: 2,
      incorrect: 0,
      unanswered: 0,
      percentage: 100,
    });
  });

  it("rounds fractional percentages to the nearest whole percent", () => {
    const assessment = makeAssessment(["A", "B", "C"]);
    assessment.answers = { [assessment.questions[0].id]: "A" };
    const result = scoreAssessment(assessment);
    expect(result.percentage).toBe(33);
    expect(result.roundingPolicy).toBe("nearest_integer");
  });

  it("rounds an exact half percentage upward", () => {
    const assessment = makeAssessment(["A", "B", "C", "D", "A", "B", "C", "D"]);
    assessment.answers = { [assessment.questions[0].id]: "A" };
    expect(scoreAssessment(assessment).percentage).toBe(13);
  });

  it("distinguishes incorrect answers and records timeout status", () => {
    const assessment = makeAssessment(["A", "B"]);
    assessment.answers = { [assessment.questions[0].id]: "D" };
    expect(scoreAssessment(assessment, true)).toMatchObject({
      correct: 0,
      incorrect: 1,
      unanswered: 1,
      timedOut: true,
    });
  });

  it("rejects answers outside the immutable question snapshot", () => {
    const assessment = makeAssessment(["A"]);
    assessment.answers = { [randomUUID()]: "A" };
    expect(() => scoreAssessment(assessment)).toThrow(AssessmentScoringError);
  });

  it("rejects inconsistent and duplicate snapshots", () => {
    const assessment = makeAssessment(["A"]);
    assessment.configuration.questionCount = 2;
    expect(() => scoreAssessment(assessment)).toThrow(AssessmentScoringError);

    assessment.configuration.questionCount = 1;
    assessment.questions.push({ ...assessment.questions[0] });
    expect(() => scoreAssessment(assessment)).toThrow(AssessmentScoringError);
  });
});
