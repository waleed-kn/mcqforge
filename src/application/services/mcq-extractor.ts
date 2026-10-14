import { randomUUID } from "node:crypto";
import type {
  DocumentProcessingWarning,
  ParsedSourcePage,
} from "@/domain/document";
import {
  answerOptionIds,
  type AnswerOptionId,
  type MultipleChoiceQuestion,
  type QuestionIssue,
} from "@/domain/question";
import {
  normalizeExtractedText,
  normalizeSourcePages,
} from "@/application/services/document-text-normalizer";

type SourceLine = {
  text: string;
  pageNumber: number | null;
};

type QuestionDraft = {
  sourceNumber: string | null;
  sourcePageNumbers: Set<number>;
  promptLines: string[];
  options: Map<string, string[]>;
  rawLines: string[];
  keyedAnswers: Set<string>;
  answerKeySourceLines: Set<string>;
  invalidAnswerKey: boolean;
  ambiguousBoundary: boolean;
};

type AnswerReference = {
  questionNumber: string;
  answer: string;
};

const QUESTION_PREFIX =
  /^(?:Q(?:uestion)?\s*(\d{1,4})\s*(?:[.):\-]\s*)?|\(?(\d{1,4})\)?[.)]\s+)(.*)$/i;
const ANSWER_LINE = /^(?:answer|ans(?:wer)?|correct\s+answer)\s*[:.)-]\s*(.*)$/i;
const ANSWER_KEY_HEADING =
  /^\s*(?:(?:answer\s*key|answers|answer\s*sheet)\s*:?\s*(.*)|key\s*:?\s*)$/i;
const OPTION_LINE = /^\(?\s*([A-Z])\s*\)?\s*[).:\-]\s*(.*)$/i;
const GENERIC_OPTION_LINE = /^\(?\s*([A-Z])\s*\)?\s*[).:\-]\s+/i;
const ANSWER_REFERENCE =
  /\b(?:Q(?:uestion)?\s*)?(\d{1,4})\s*(?:[.):\-]\s*|\s+)\(?([A-Z])\)?\b/gi;

type ParsedQuestionStart = {
  sourceNumber: string;
  prompt: string;
};

export function detectQuestionBoundary(line: string): ParsedQuestionStart | null {
  const match = line.match(QUESTION_PREFIX);
  if (!match) return null;

  const sourceNumber = match[1] ?? match[2];
  return sourceNumber
    ? { sourceNumber, prompt: (match[3] ?? "").trim() }
    : null;
}

export function parseOptionLine(
  line: string,
): { label: string; text: string } | null {
  const match = line.match(OPTION_LINE);
  return match ? { label: match[1].toUpperCase(), text: match[2].trim() } : null;
}

export function parseAnswerKeyLine(line: string): AnswerReference[] {
  const references: AnswerReference[] = [];
  for (const match of line.matchAll(ANSWER_REFERENCE)) {
    references.push({
      questionNumber: match[1],
      answer: match[2].toUpperCase(),
    });
  }
  return references;
}

function isAnswerOptionId(value: string): value is AnswerOptionId {
  return answerOptionIds.some((optionId) => optionId === value);
}

function parseInlineOptions(line: string) {
  const marker = /(?:^|\s)(\([A-D]\)|[A-D][).])\s+/gi;
  const markers = [...line.matchAll(marker)];
  if (markers.length < 2) return null;

  const firstStart = markers[0].index ?? 0;
  const options: { label: string; text: string }[] = [];
  for (let index = 0; index < markers.length; index += 1) {
    const current = markers[index];
    const contentStart = (current.index ?? 0) + current[0].length;
    const contentEnd =
      index + 1 < markers.length
        ? (markers[index + 1].index ?? line.length)
        : line.length;
    const labelMatch = current[1].match(/[A-D]/i);
    if (!labelMatch) continue;
    options.push({
      label: labelMatch[0].toUpperCase(),
      text: line.slice(contentStart, contentEnd).trim(),
    });
  }

  return { prompt: line.slice(0, firstStart).trim(), options };
}

function createDraft(
  start: ParsedQuestionStart,
  pageNumber: number | null,
  firstLine: string,
): QuestionDraft {
  return {
    sourceNumber: start.sourceNumber,
    sourcePageNumbers: new Set(pageNumber === null ? [] : [pageNumber]),
    promptLines: start.prompt ? [start.prompt] : [],
    options: new Map(),
    rawLines: [firstLine],
    keyedAnswers: new Set(),
    answerKeySourceLines: new Set(),
    invalidAnswerKey: false,
    ambiguousBoundary: false,
  };
}

function addOption(draft: QuestionDraft, label: string, value: string) {
  const existing = draft.options.get(label) ?? [];
  existing.push(value);
  draft.options.set(label, existing);
}

function appendToLastOption(draft: QuestionDraft, line: string) {
  const lastOption = [...draft.options.keys()].at(-1);
  if (lastOption) {
    const values = draft.options.get(lastOption);
    if (values) values[values.length - 1] = `${values.at(-1)} ${line}`.trim();
    return;
  }
  draft.promptLines.push(line);
}

function addIssue(issues: QuestionIssue[], code: QuestionIssue["code"], message: string) {
  if (!issues.some((issue) => issue.code === code)) issues.push({ code, message });
}

function resolveAnswer(
  draft: QuestionDraft,
  answerReferences: Map<string, Set<string>>,
  answerKeySourceLines: Map<string, Set<string>>,
  duplicateNumbers: Set<string>,
) {
  const issues: QuestionIssue[] = [];
  const prompt = draft.promptLines.join(" ").replace(/\s+/g, " ").trim();
  if (!prompt) addIssue(issues, "missing_prompt", "Question text could not be identified.");

  const options: Partial<Record<AnswerOptionId, string>> = {};
  for (const label of answerOptionIds) {
    const values = draft.options.get(label) ?? [];
    const optionText = values.join(" ").replace(/\s+/g, " ").trim();
    if (values.length > 1) {
      addIssue(
        issues,
        "duplicate_option_label",
        `Option ${label} appears more than once.`,
      );
    }
    if (!optionText) {
      addIssue(issues, "missing_option", `Option ${label} is missing or empty.`);
    } else {
      options[label] = optionText;
    }
  }

  for (const label of draft.options.keys()) {
    if (!isAnswerOptionId(label)) {
      addIssue(
        issues,
        "unsupported_option_label",
        `Option ${label} is not supported; questions must use A, B, C, and D.`,
      );
    }
  }

  if (draft.sourceNumber && duplicateNumbers.has(draft.sourceNumber)) {
    addIssue(
      issues,
      "ambiguous_question_number",
      `Question number ${draft.sourceNumber} is repeated, so its answer-key reference is ambiguous.`,
    );
  }
  if (draft.ambiguousBoundary) {
    addIssue(
      issues,
      "ambiguous_question_boundary",
      "A question-like line appears inside this question without a recognizable number; review where the question ends.",
    );
  }

  const referencedAnswers = answerReferences.get(draft.sourceNumber ?? "");
  const answerValues = new Set([
    ...draft.keyedAnswers,
    ...(duplicateNumbers.has(draft.sourceNumber ?? "") ? [] : referencedAnswers ?? []),
  ]);
  const supportedAnswers = [...answerValues].filter((answer) =>
    isAnswerOptionId(answer),
  );

  if (draft.invalidAnswerKey || [...answerValues].some((answer) => !isAnswerOptionId(answer))) {
    addIssue(
      issues,
      "invalid_answer_key",
      "The answer key does not refer to a supported option A, B, C, or D.",
    );
  }
  if (supportedAnswers.length > 1) {
    addIssue(
      issues,
      "multiple_correct_answers",
      "More than one correct answer is marked for this question.",
    );
  }

  const correctOption =
    !draft.invalidAnswerKey && supportedAnswers.length === 1
      ? supportedAnswers[0]
      : null;
  if (answerValues.size === 0) {
    addIssue(issues, "missing_answer_key", "No answer key was found for this question.");
  }

  const externalKeyLines = answerKeySourceLines.get(draft.sourceNumber ?? "") ?? [];
  const sourceText = [...draft.rawLines, ...externalKeyLines].join("\n").trim();
  return {
    id: randomUUID(),
    sourceNumber: draft.sourceNumber,
    sourcePageNumbers: [...draft.sourcePageNumbers].sort((a, b) => a - b),
    prompt,
    options,
    correctOption,
    sourceText,
    issues,
    status: issues.length === 0 ? "valid" : "needs_review",
  } satisfies MultipleChoiceQuestion;
}

function linesFromPages(pages: readonly ParsedSourcePage[]): SourceLine[] {
  return normalizeSourcePages(pages).flatMap((page) =>
    page.text
      .split("\n")
      .map((text) => ({ text, pageNumber: page.pageNumber })),
  );
}

export function extractMultipleChoiceQuestions(
  pages: readonly ParsedSourcePage[],
): { questions: MultipleChoiceQuestion[]; warnings: DocumentProcessingWarning[] } {
  const lines = linesFromPages(pages);
  const drafts: QuestionDraft[] = [];
  const warnings: DocumentProcessingWarning[] = [];
  const answerReferences = new Map<string, Set<string>>();
  let current: QuestionDraft | null = null;
  let inAnswerKey = false;
  let ignoredContent = false;
  let orphanOptions = false;

  function saveCurrent() {
    if (current) drafts.push(current);
    current = null;
  }

  function addAnswerReference(reference: AnswerReference, sourceLine: string) {
    const answers = answerReferences.get(reference.questionNumber) ?? new Set<string>();
    answers.add(reference.answer);
    answerReferences.set(reference.questionNumber, answers);
    const sourceLines =
      answerKeySourceLines.get(reference.questionNumber) ?? new Set<string>();
    sourceLines.add(sourceLine);
    answerKeySourceLines.set(reference.questionNumber, sourceLines);
  }

  const answerKeySourceLines = new Map<string, Set<string>>();

  for (const { text, pageNumber } of lines) {
    if (!text) continue;

    const keyHeading = text.match(ANSWER_KEY_HEADING);
    if (keyHeading) {
      inAnswerKey = true;
      saveCurrent();
      for (const reference of parseAnswerKeyLine(keyHeading[1] ?? "")) {
        addAnswerReference(reference, text);
      }
      continue;
    }

    if (inAnswerKey) {
      const keyReferences = parseAnswerKeyLine(text);
      if (keyReferences.length) {
        for (const reference of keyReferences) {
          addAnswerReference(reference, text);
        }
        continue;
      } else if (!detectQuestionBoundary(text)) {
        continue;
      } else {
        inAnswerKey = false;
      }
    }

    const questionStart = detectQuestionBoundary(text);
    if (questionStart) {
      saveCurrent();
      current = createDraft(questionStart, pageNumber, text);
      if (pageNumber !== null) current.sourcePageNumbers.add(pageNumber);

      const inline = parseInlineOptions(questionStart.prompt);
      if (inline) {
        current.promptLines = inline.prompt ? [inline.prompt] : [];
        for (const option of inline.options) addOption(current, option.label, option.text);
      }
      continue;
    }

    const answerLine = text.match(ANSWER_LINE);
    if (answerLine && current) {
      current.rawLines.push(text);
      const values = [...answerLine[1].matchAll(/\b([A-Z])\b/gi)].map((match) =>
        match[1].toUpperCase(),
      );
      if (values.length === 0) current.invalidAnswerKey = true;
      for (const value of values) current.keyedAnswers.add(value);
      if (pageNumber !== null) current.sourcePageNumbers.add(pageNumber);
      continue;
    }

    const option = parseOptionLine(text);
    if (option && current) {
      current.rawLines.push(text);
      addOption(current, option.label, option.text);
      if (pageNumber !== null) current.sourcePageNumbers.add(pageNumber);
      continue;
    }

    const unknownOption = text.match(GENERIC_OPTION_LINE);
    if (unknownOption && current) {
      current.rawLines.push(text);
      addOption(current, unknownOption[1].toUpperCase(), text.replace(GENERIC_OPTION_LINE, "").trim());
      if (pageNumber !== null) current.sourcePageNumbers.add(pageNumber);
      continue;
    }

    if (current) {
      if (
        current.options.size >= 2 &&
        (/\?\s*$/.test(text) ||
          /^(?:what|which|who|whom|whose|when|where|why|how|select|choose|identify|name|define)\b/i.test(
            text,
          ))
      ) {
        current.ambiguousBoundary = true;
        current.rawLines.push(text);
        saveCurrent();
        ignoredContent = true;
        continue;
      }
      const inline = current.options.size === 0 ? parseInlineOptions(text) : null;
      if (inline) {
        current.rawLines.push(text);
        if (inline.prompt) current.promptLines.push(inline.prompt);
        for (const inlineOption of inline.options) {
          addOption(current, inlineOption.label, inlineOption.text);
        }
      } else {
        current.rawLines.push(text);
        appendToLastOption(current, text);
      }
      if (pageNumber !== null) current.sourcePageNumbers.add(pageNumber);
      continue;
    }

    if (parseOptionLine(text) || GENERIC_OPTION_LINE.test(text)) {
      orphanOptions = true;
    } else if (
      /\?\s*$/.test(text) ||
      /^(?:what|which|who|whom|whose|when|where|why|how|select|choose|identify|name|define)\b/i.test(
        text,
      )
    ) {
      ignoredContent = true;
    }
  }
  saveCurrent();

  const numberCounts = new Map<string, number>();
  for (const draft of drafts) {
    if (!draft.sourceNumber) continue;
    numberCounts.set(
      draft.sourceNumber,
      (numberCounts.get(draft.sourceNumber) ?? 0) + 1,
    );
  }
  const duplicateNumbers = new Set(
    [...numberCounts]
      .filter(([, count]) => count > 1)
      .map(([sourceNumber]) => sourceNumber),
  );

  for (const [questionNumber] of answerReferences) {
    if (!numberCounts.has(questionNumber)) {
      warnings.push({
        code: "invalid_answer_reference",
        message: `The answer key refers to question ${questionNumber}, which was not detected.`,
      });
    }
  }
  if (orphanOptions) {
    warnings.push({
      code: "unrecognized_content",
      message: "Option-like lines outside a clearly identified question were not assigned.",
    });
  }
  if (ignoredContent) {
    warnings.push({
      code: "unrecognized_content",
      message: "Some text could not be assigned to a clearly numbered question.",
    });
  }
  if (drafts.length === 0) {
    warnings.push({
      code: "no_questions",
      message: "No clearly numbered questions were detected. Check the document layout and numbering.",
    });
  }

  return {
    questions: drafts.map((draft) =>
      resolveAnswer(
        draft,
        answerReferences,
        answerKeySourceLines,
        duplicateNumbers,
      ),
    ),
    warnings,
  };
}

export function normalizeSourceTextToPages(
  text: string,
  pageNumber: number | null = null,
): ParsedSourcePage[] {
  const normalized = normalizeExtractedText(text);
  return normalized ? [{ pageNumber, text: normalized }] : [];
}
