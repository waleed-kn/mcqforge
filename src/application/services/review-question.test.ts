import { randomUUID } from "node:crypto";
import { describe, expect, it } from "vitest";
import type { MultipleChoiceQuestion } from "@/domain/question";
import {
  applyQuestionEdits,
  hasQuestionEdits,
  restoreQuestionDraft,
  updateQuestionDraft,
} from "./review-question";

function createQuestion(): MultipleChoiceQuestion {
  return {
    id: randomUUID(),
    sourceNumber: "1",
    sourcePageNumbers: [],
    prompt: "",
    options: { A: "First", B: "Second", C: "Third", D: "Fourth" },
    correctOption: null,
    sourceText: "source question",
    issues: [
      { code: "missing_prompt", message: "Question text was not detected." },
      { code: "missing_answer_key", message: "No answer key was found." },
      {
        code: "ambiguous_question_boundary",
        message: "A question boundary may be ambiguous.",
      },
    ],
    status: "needs_review",
  };
}

describe("applyQuestionEdits", () => {
  it("requires prompt, four non-empty options, and a correct answer", () => {
    const question = applyQuestionEdits(createQuestion(), {
      prompt: "   ",
      options: { A: "First", B: "", C: "Third", D: "Fourth" },
      correctOption: null,
    });

    expect(question.status).toBe("needs_review");
    expect(question.issues.map((issue) => issue.code)).toEqual(
      expect.arrayContaining([
        "missing_prompt",
        "missing_option",
        "missing_answer_key",
        "ambiguous_question_boundary",
      ]),
    );
  });

  it("marks a completed question valid and allows repeated option text", () => {
    const question = applyQuestionEdits(createQuestion(), {
      prompt: "  Pick an option  ",
      options: {
        A: "Same text",
        B: "Same text",
        C: "A different option",
        D: "Another option",
      },
      correctOption: "B",
    });

    expect(question).toMatchObject({
      prompt: "Pick an option",
      status: "valid",
      correctOption: "B",
      options: { A: "Same text", B: "Same text" },
    });
    expect(question.issues.map((issue) => issue.code)).toEqual([
      "ambiguous_question_boundary",
    ]);
  });
});

describe("review question drafts", () => {
  it("retains unsaved edits when another question is selected", () => {
    const first = createQuestion();
    const second = { ...createQuestion(), prompt: "Second question" };
    const saved = [first, second];
    const drafts = updateQuestionDraft(saved, first.id, {
      prompt: "Updated question",
      options: first.options,
      correctOption: "A",
    });

    expect(drafts.find((question) => question.id === second.id)?.prompt).toBe(
      "Second question",
    );
    expect(drafts.find((question) => question.id === first.id)?.prompt).toBe(
      "Updated question",
    );
    const updatedFirst = drafts.find((question) => question.id === first.id);
    if (!updatedFirst) throw new Error("Updated question draft was not retained.");
    expect(hasQuestionEdits(updatedFirst, first)).toBe(true);
  });

  it("restores the saved question when edits are cancelled", () => {
    const saved = createQuestion();
    const edited = updateQuestionDraft([saved], saved.id, {
      prompt: "Unsaved text",
      options: { ...saved.options, A: "Changed option" },
      correctOption: "D",
    });
    const cancelled = restoreQuestionDraft(edited, [saved], saved.id);

    const cancelledQuestion = cancelled.find((question) => question.id === saved.id);
    if (!cancelledQuestion) throw new Error("Cancelled question was not restored.");
    expect(cancelledQuestion).toEqual(saved);
    expect(hasQuestionEdits(cancelledQuestion, saved)).toBe(false);
  });
});
