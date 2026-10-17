import { randomUUID } from "node:crypto";
import { describe, expect, it } from "vitest";
import type { MultipleChoiceQuestion } from "@/domain/question";
import { selectAssessmentQuestions } from "./select-assessment-questions";

function makeQuestion(overrides: Partial<MultipleChoiceQuestion> = {}): MultipleChoiceQuestion {
  return {
    id: randomUUID(),
    sourceNumber: null,
    sourcePageNumbers: [],
    prompt: "Question",
    options: { A: "One", B: "Two", C: "Three", D: "Four" },
    correctOption: "A",
    sourceText: "",
    issues: [],
    status: "valid",
    ...overrides,
  };
}

describe("selectAssessmentQuestions", () => {
  it("selects without replacement using an unbiased-in-production partial shuffle", () => {
    const questions = Array.from({ length: 5 }, () => makeQuestion());
    const selected = selectAssessmentQuestions(questions, 3, () => 0);

    expect(selected).toHaveLength(3);
    expect(new Set(selected.map((question) => question.id)).size).toBe(3);
    expect(selected.map((question) => question.id)).toEqual(
      questions.slice(0, 3).map((question) => question.id),
    );
  });

  it("does not select invalid questions and rejects unavailable counts", () => {
    const valid = makeQuestion();
    const invalid = makeQuestion({ status: "needs_review" });
    const duplicateId = makeQuestion({ id: valid.id });
    expect(selectAssessmentQuestions([valid, invalid], 1)).toEqual([valid]);
    expect(selectAssessmentQuestions([valid, duplicateId], 1)).toHaveLength(1);
    expect(() => selectAssessmentQuestions([valid, invalid], 2)).toThrow(
      /exceeds the available valid questions/,
    );
    expect(() => selectAssessmentQuestions([valid], 0)).toThrow(
      /positive integer/,
    );
  });
});
