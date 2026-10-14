export const answerOptionIds = ["A", "B", "C", "D"] as const;

export type AnswerOptionId = (typeof answerOptionIds)[number];

export type MultipleChoiceQuestion = {
  prompt: string;
  options: Record<AnswerOptionId, string>;
  correctOption: AnswerOptionId;
};

export type DocumentParseIssue = {
  message: string;
  questionNumber?: number;
};

export type DocumentParseResult = {
  questions: MultipleChoiceQuestion[];
  issues: DocumentParseIssue[];
};
