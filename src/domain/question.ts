export const answerOptionIds = ["A", "B", "C", "D"] as const;

export type AnswerOptionId = (typeof answerOptionIds)[number];

export type QuestionIssueCode =
  | "missing_prompt"
  | "missing_option"
  | "duplicate_option_label"
  | "unsupported_option_label"
  | "missing_answer_key"
  | "invalid_answer_key"
  | "multiple_correct_answers"
  | "ambiguous_question_number"
  | "ambiguous_question_boundary";

export type QuestionIssue = {
  code: QuestionIssueCode;
  message: string;
};

export type QuestionStatus = "valid" | "needs_review";

export type MultipleChoiceQuestion = {
  id: string;
  sourceNumber: string | null;
  sourcePageNumbers: number[];
  prompt: string;
  options: Record<AnswerOptionId, string>;
  correctOption: AnswerOptionId | null;
  sourceText: string;
  issues: QuestionIssue[];
  status: QuestionStatus;
};

export type DocumentParseResult = {
  questions: MultipleChoiceQuestion[];
  warnings: import("./document").DocumentProcessingWarning[];
};
