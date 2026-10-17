import {
  allowedAssessmentDurationsMinutes,
  assessmentQuestionLimit,
  assessmentTtlSeconds,
} from "@/application/config/assessment";
import type { AssessmentConfiguration, AssessmentRecord } from "@/domain/assessment";
import type { AnswerOptionId, MultipleChoiceQuestion } from "@/domain/question";
import { selectAssessmentQuestions } from "@/application/services/select-assessment-questions";

const allowedDurations = new Set<number>(allowedAssessmentDurationsMinutes);

export type CreateAssessmentErrorCode =
  | "invalid_question_count"
  | "not_enough_questions"
  | "invalid_duration";

export class CreateAssessmentError extends Error {
  constructor(
    readonly code: CreateAssessmentErrorCode,
    message: string,
  ) {
    super(message);
    this.name = "CreateAssessmentError";
  }
}

export function createAssessmentRecord(input: {
  id: string;
  ownerId: string;
  documentId: string;
  requestId: string;
  configuration: AssessmentConfiguration;
  availableQuestions: readonly MultipleChoiceQuestion[];
  now?: number;
}): AssessmentRecord {
  const { configuration } = input;
  if (
    !Number.isInteger(configuration.questionCount) ||
    configuration.questionCount < 1 ||
    configuration.questionCount > assessmentQuestionLimit
  ) {
    throw new CreateAssessmentError(
      "invalid_question_count",
      "Choose a whole number of questions from 1 to 100.",
    );
  }
  if (
    configuration.mode === "timed" &&
    (configuration.durationMinutes === undefined ||
      !allowedDurations.has(configuration.durationMinutes))
  ) {
    throw new CreateAssessmentError(
      "invalid_duration",
      "Choose an allowed duration for a timed test.",
    );
  }

  const validAvailable = input.availableQuestions.filter(
    (question): question is MultipleChoiceQuestion & {
      correctOption: AnswerOptionId;
    } => question.status === "valid" && question.correctOption !== null,
  );
  const availableCount = new Set(validAvailable.map((question) => question.id)).size;
  if (configuration.questionCount > availableCount) {
    throw new CreateAssessmentError(
      "not_enough_questions",
      `You requested ${configuration.questionCount} questions, but only ${availableCount} valid questions are available. Choose a smaller count or upload another document.`,
    );
  }

  const now = input.now ?? Date.now();
  const selected = selectAssessmentQuestions(
    validAvailable,
    configuration.questionCount,
  );
  const normalizedConfiguration: AssessmentConfiguration =
    configuration.mode === "timed"
      ? {
          questionCount: configuration.questionCount,
          mode: "timed",
          durationMinutes: configuration.durationMinutes,
        }
      : { questionCount: configuration.questionCount, mode: "untimed" };

  return {
    id: input.id,
    ownerId: input.ownerId,
    documentId: input.documentId,
    requestId: input.requestId,
    configuration: normalizedConfiguration,
    questions: selected.map(
      ({ id, sourceNumber, sourcePageNumbers, prompt, options, correctOption }) => ({
        id,
        sourceNumber,
        sourcePageNumbers: [...sourcePageNumbers],
        prompt,
        options: { ...options },
        correctOption,
      }),
    ),
    answers: {},
    revision: 0,
    lastMutationId: null,
    status: "in_progress",
    createdAt: now,
    startedAt: now,
    deadline:
      configuration.mode === "timed"
        ? now + (configuration.durationMinutes ?? 0) * 60_000
        : null,
    submittedAt: null,
    result: null,
    expiresAt: now + assessmentTtlSeconds * 1000,
  };
}
