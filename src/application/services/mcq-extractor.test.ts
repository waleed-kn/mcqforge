import { describe, expect, it } from "vitest";
import type { ParsedSourcePage } from "@/domain/document";
import {
  detectQuestionBoundary,
  extractMultipleChoiceQuestions,
  parseAnswerKeyLine,
  parseOptionLine,
} from "./mcq-extractor";
import { normalizeExtractedText } from "./document-text-normalizer";

function parseText(text: string, pageNumber: number | null = null) {
  const page: ParsedSourcePage = { pageNumber, text };
  return extractMultipleChoiceQuestions([page]);
}

describe("document text normalization", () => {
  it("normalizes line endings and irregular spaces without flattening lines", () => {
    expect(normalizeExtractedText("\uFEFFQ1:\t  Prompt\r\n A)\u00a0First\rB) Second")).toBe(
      "Q1: Prompt\nA) First\nB) Second",
    );
  });
});

describe("question and option boundaries", () => {
  it.each([
    ["1. What is this?", "1"],
    ["Q1: What is this?", "1"],
    ["Question 12 What is this?", "12"],
    ["(4) What is this?", "4"],
  ])("detects question boundary %s", (line, number) => {
    expect(detectQuestionBoundary(line)).toMatchObject({ sourceNumber: number });
  });

  it("does not treat unnumbered prose as a confident question boundary", () => {
    expect(detectQuestionBoundary("What is this?")).toBeNull();
  });

  it.each([
    ["(A) First choice", { label: "A", text: "First choice" }],
    ["B) Second choice", { label: "B", text: "Second choice" }],
    ["C. Third choice", { label: "C", text: "Third choice" }],
    ["D: Fourth choice", { label: "D", text: "Fourth choice" }],
  ])("parses option label from %s", (line, option) => {
    expect(parseOptionLine(line)).toEqual(option);
  });

  it("parses answer-key entries using several common forms", () => {
    expect(parseAnswerKeyLine("1. A, Q2: (C), 3-D")).toEqual([
      { questionNumber: "1", answer: "A" },
      { questionNumber: "2", answer: "C" },
      { questionNumber: "3", answer: "D" },
    ]);
  });
});

describe("MCQ extraction and validation", () => {
  it("extracts valid questions and maps answer keys to the source question number", () => {
    const result = parseText(
      [
        "PRACTICE QUESTIONS",
        "Question 1: Which option is correct?",
        "(A) First",
        "B) Second",
        "C. Third",
        "D: Fourth",
        "Question 2 What is next?",
        "A) Alpha",
        "B) Beta",
        "C) Gamma",
        "D) Delta",
        "Answer Key",
        "1. C",
        "Q2: A",
      ].join("\n"),
      3,
    );

    expect(result.questions).toHaveLength(2);
    expect(result.questions[0]).toMatchObject({
      sourceNumber: "1",
      sourcePageNumbers: [3],
      correctOption: "C",
      status: "valid",
    });
    expect(result.questions[0].options).toEqual({
      A: "First",
      B: "Second",
      C: "Third",
      D: "Fourth",
    });
    expect(result.questions[1]).toMatchObject({
      sourceNumber: "2",
      correctOption: "A",
      status: "valid",
    });
    expect(result.questions[0].sourceText).toContain("1. C");
    expect(result.questions[0].id).not.toBe("1");
    expect(result.warnings).toEqual([]);
  });

  it("marks missing options and missing answer keys for review", () => {
    const { questions } = parseText(
      [
        "1. Pick one",
        "A) Only choice",
        "B) Next choice",
        "C) Third choice",
      ].join("\n"),
    );

    expect(questions[0].status).toBe("needs_review");
    expect(questions[0].issues.map((issue) => issue.code)).toEqual(
      expect.arrayContaining(["missing_option", "missing_answer_key"]),
    );
    expect(questions[0].correctOption).toBeNull();
  });

  it("flags duplicate labels and repeated question numbers without reusing them as IDs", () => {
    const { questions } = parseText(
      [
        "1. First question",
        "A) First",
        "A) Duplicate",
        "B) Second",
        "C) Third",
        "D) Fourth",
        "1. Another question",
        "A) First",
        "B) Second",
        "C) Third",
        "D) Fourth",
        "Answer Key",
        "1-A",
      ].join("\n"),
    );

    expect(questions[0].issues.map((issue) => issue.code)).toEqual(
      expect.arrayContaining(["duplicate_option_label", "ambiguous_question_number"]),
    );
    expect(questions[1].issues.map((issue) => issue.code)).toContain(
      "ambiguous_question_number",
    );
    expect(questions[0].id).not.toBe(questions[1].id);
    expect(questions[0].correctOption).toBeNull();
  });

  it("flags multiple apparent correct answers and invalid answer references", () => {
    const { questions, warnings } = parseText(
      [
        "1. Choose",
        "A) One",
        "B) Two",
        "C) Three",
        "D) Four",
        "Answer: A and B",
        "Answer Key",
        "2. E",
      ].join("\n"),
    );

    expect(questions[0].issues.map((issue) => issue.code)).toContain(
      "multiple_correct_answers",
    );
    expect(questions[0].status).toBe("needs_review");
    expect(warnings).toContainEqual(
      expect.objectContaining({ code: "invalid_answer_reference" }),
    );
  });

  it("does not map an unsupported answer key label to a valid option", () => {
    const { questions } = parseText(
      [
        "1. Choose",
        "A) One",
        "B) Two",
        "C) Three",
        "D) Four",
        "Answer Key",
        "1. E",
      ].join("\n"),
    );

    expect(questions[0].correctOption).toBeNull();
    expect(questions[0].issues.map((issue) => issue.code)).toContain(
      "invalid_answer_key",
    );
    expect(questions[0].status).toBe("needs_review");
  });

  it("flags unnumbered MCQ-like content as unrecognized instead of guessing a question", () => {
    const { questions, warnings } = parseText(
      ["Which option is right?", "A) First", "B) Second"].join("\n"),
    );

    expect(questions).toEqual([]);
    expect(warnings.map((warning) => warning.code)).toEqual(
      expect.arrayContaining(["unrecognized_content", "no_questions"]),
    );
  });

  it("marks a question-like sentence inside a question as an ambiguous boundary", () => {
    const { questions } = parseText(
      [
        "1. First question?",
        "A) First",
        "B) Second",
        "The next question asks why this happens?",
        "C) Third",
        "D) Fourth",
        "Answer: A",
      ].join("\n"),
    );

    expect(questions[0].issues.map((issue) => issue.code)).toContain(
      "ambiguous_question_boundary",
    );
    expect(questions[0].status).toBe("needs_review");
  });

  it("retains question provenance and original lines for manual correction", () => {
    const { questions } = parseText(
      ["Q7 prompt", "A) One", "B) Two", "C) Three", "D) Four", "Answer: D"].join(
        "\n",
      ),
      8,
    );

    expect(questions[0].sourceNumber).toBe("7");
    expect(questions[0].sourcePageNumbers).toEqual([8]);
    expect(questions[0].sourceText).toContain("Answer: D");
  });
});
