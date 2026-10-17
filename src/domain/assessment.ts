import type { AnswerOptionId, MultipleChoiceQuestion } from "@/domain/question";

export type AssessmentMode = "timed" | "untimed";
export type AssessmentStatus = "in_progress" | "submitted";

export type AssessmentConfiguration = {
  questionCount: number;
  mode: AssessmentMode;
  durationMinutes?: number;
};

export type AssessmentQuestionSnapshot = Pick<
  MultipleChoiceQuestion,
  | "id"
  | "sourceNumber"
  | "sourcePageNumbers"
  | "prompt"
  | "options"
  | "correctOption"
>;

export type AssessmentRecord = {
  id: string;
  ownerId: string;
  documentId: string;
  requestId: string;
  configuration: AssessmentConfiguration;
  questions: AssessmentQuestionSnapshot[];
  status: AssessmentStatus;
  createdAt: number;
  startedAt: number;
  deadline: number | null;
  expiresAt: number;
};

export type ActiveAssessmentQuestion = {
  id: string;
  sourceNumber: string | null;
  sourcePageNumbers: number[];
  prompt: string;
  options: Record<AnswerOptionId, string>;
};

export type ActiveAssessment = Omit<AssessmentRecord, "ownerId" | "requestId" | "questions"> & {
  questions: ActiveAssessmentQuestion[];
};

export type AssessmentTransitionResult =
  | { ok: true; assessment: AssessmentRecord }
  | { ok: false; reason: "already_submitted" | "unsupported_transition" };

export function transitionAssessment(
  assessment: AssessmentRecord,
  nextStatus: AssessmentStatus,
  submittedAt: number,
): AssessmentTransitionResult {
  if (assessment.status === "submitted") {
    return { ok: false, reason: "already_submitted" };
  }
  if (nextStatus !== "submitted" || submittedAt < assessment.startedAt) {
    return { ok: false, reason: "unsupported_transition" };
  }
  return {
    ok: true,
    assessment: { ...assessment, status: "submitted" },
  };
}

export function toActiveAssessment(
  assessment: AssessmentRecord,
): ActiveAssessment {
  return {
    id: assessment.id,
    documentId: assessment.documentId,
    configuration: assessment.configuration,
    status: assessment.status,
    createdAt: assessment.createdAt,
    startedAt: assessment.startedAt,
    deadline: assessment.deadline,
    expiresAt: assessment.expiresAt,
    questions: assessment.questions.map(
      ({ id, sourceNumber, sourcePageNumbers, prompt, options }) => ({
        id,
        sourceNumber,
        sourcePageNumbers,
        prompt,
        options,
      }),
    ),
  };
}
