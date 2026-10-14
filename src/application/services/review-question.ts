import type { MultipleChoiceQuestion, QuestionIssue } from "@/domain/question";
import { answerOptionIds } from "@/domain/question";

export type EditableReviewQuestion = Pick<
  MultipleChoiceQuestion,
  "prompt" | "options" | "correctOption"
>;

export function hasQuestionEdits(
  left: EditableReviewQuestion,
  right: EditableReviewQuestion,
): boolean {
  return (
    left.prompt !== right.prompt ||
    answerOptionIds.some((optionId) => left.options[optionId] !== right.options[optionId]) ||
    left.correctOption !== right.correctOption
  );
}

export function updateQuestionDraft(
  questions: readonly MultipleChoiceQuestion[],
  questionId: string,
  edits: EditableReviewQuestion,
): MultipleChoiceQuestion[] {
  return questions.map((question) =>
    question.id === questionId ? applyQuestionEdits(question, edits) : question,
  );
}

export function restoreQuestionDraft(
  drafts: readonly MultipleChoiceQuestion[],
  savedQuestions: readonly MultipleChoiceQuestion[],
  questionId: string,
): MultipleChoiceQuestion[] {
  const saved = savedQuestions.find((question) => question.id === questionId);
  return saved
    ? drafts.map((question) => (question.id === questionId ? saved : question))
    : [...drafts];
}

const preservedParserIssueCodes = new Set<QuestionIssue["code"]>([
  "ambiguous_question_number",
  "ambiguous_question_boundary",
]);

export function applyQuestionEdits(
  question: MultipleChoiceQuestion,
  edits: EditableReviewQuestion,
): MultipleChoiceQuestion {
  const issues: QuestionIssue[] = question.issues.filter((issue) =>
    preservedParserIssueCodes.has(issue.code),
  );
  const prompt = edits.prompt.trim();
  const options = Object.fromEntries(
    answerOptionIds.map((optionId) => [
      optionId,
      edits.options[optionId].trim(),
    ]),
  ) as Record<(typeof answerOptionIds)[number], string>;

  if (!prompt) {
    issues.push({
      code: "missing_prompt",
      message: "Add question text before this question can be used.",
    });
  }
  for (const optionId of answerOptionIds) {
    if (!options[optionId]) {
      issues.push({
        code: "missing_option",
        message: `Add text for option ${optionId} before this question can be used.`,
      });
    }
  }
  if (!edits.correctOption) {
    issues.push({
      code: "missing_answer_key",
      message: "Select the correct answer before this question can be used.",
    });
  }

  const hasRequiredFields =
    Boolean(prompt) &&
    answerOptionIds.every((optionId) => Boolean(options[optionId])) &&
    answerOptionIds.some((optionId) => optionId === edits.correctOption);

  return {
    ...question,
    prompt,
    options,
    correctOption: edits.correctOption,
    issues,
    status: hasRequiredFields ? "valid" : "needs_review",
  };
}
