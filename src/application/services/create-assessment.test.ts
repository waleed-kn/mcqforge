import { randomUUID } from "node:crypto";
import { describe, expect, it } from "vitest";
import type { AssessmentRecord } from "@/domain/assessment";
import type { MultipleChoiceQuestion } from "@/domain/question";
import { createAssessmentRecord } from "./create-assessment";

function makeQuestions(count: number): MultipleChoiceQuestion[] {
  return Array.from({ length: count }, (_, index) => ({
    id: randomUUID(),
    sourceNumber: String(index + 1),
    sourcePageNumbers: [],
    prompt: `Question ${index + 1}`,
    options: { A: "One", B: "Two", C: "Three", D: "Four" },
    correctOption: "A",
    sourceText: "",
    issues: [],
    status: "valid",
  }));
}

function createRecord(
  configuration: AssessmentRecord["configuration"],
  availableQuestions: MultipleChoiceQuestion[],
  now = 1_000,
) {
  return createAssessmentRecord({
    id: randomUUID(),
    ownerId: randomUUID(),
    documentId: randomUUID(),
    requestId: randomUUID(),
    configuration,
    availableQuestions,
    now,
  });
}

describe("createAssessmentRecord", () => {
  it("accepts minimum and maximum counts, snapshots the selection and sets server times", () => {
    const questions = makeQuestions(100);
    const minimum = createRecord(
      { questionCount: 1, mode: "untimed" },
      questions,
    );
    const maximum = createRecord(
      { questionCount: 100, mode: "untimed" },
      questions,
    );
    expect(minimum.questions).toHaveLength(1);
    expect(minimum.startedAt).toBe(1_000);
    expect(minimum.deadline).toBeNull();
    expect(maximum.questions).toHaveLength(100);
    expect(new Set(maximum.questions.map((question) => question.id)).size).toBe(100);
  });

  it("rejects counts over 100 and counts exceeding available questions", () => {
    expect(() =>
      createRecord({ questionCount: 101, mode: "untimed" }, makeQuestions(101)),
    ).toThrow(/1 to 100/);
    expect(() =>
      createRecord({ questionCount: 2, mode: "untimed" }, makeQuestions(1)),
    ).toThrow(/only 1 valid questions are available/);
  });

  it("requires an allowed timed duration and omits a deadline for untimed tests", () => {
    const timed = createRecord(
      { questionCount: 1, mode: "timed", durationMinutes: 30 },
      makeQuestions(1),
      5_000,
    );
    expect(timed.deadline).toBe(5_000 + 30 * 60_000);

    expect(() =>
      createRecord({ questionCount: 1, mode: "timed", durationMinutes: 20 }, makeQuestions(1)),
    ).toThrow(/allowed duration/);
    expect(() =>
      createRecord(
        { questionCount: 1, mode: "timed" },
        makeQuestions(1),
      ),
    ).toThrow(/allowed duration/);
  });
});
