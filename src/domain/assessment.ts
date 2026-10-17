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
  answers: Record<string, AnswerOptionId>;
  revision: number;
  lastMutationId: string | null;
  status: AssessmentStatus;
  createdAt: number;
  startedAt: number;
  deadline: number | null;
  submittedAt: number | null;
  expiresAt: number;
};

export type ActiveAssessmentQuestion = {
  id: string;
  sourceNumber: string | null;
  sourcePageNumbers: number[];
  prompt: string;
  options: Record<AnswerOptionId, string>;
};

export type ActiveAssessment = Omit<
  AssessmentRecord,
  "ownerId" | "requestId" | "questions" | "lastMutationId"
> & {
  questions: ActiveAssessmentQuestion[];
};

export type SubmissionSummary = {
  answered: number;
  unanswered: number;
  submittedAt: number;
  timedOut: boolean;
};

export function moveAssessmentQuestion(
  currentIndex: number,
  questionCount: number,
  direction: -1 | 1,
): number {
  if (questionCount <= 0) return 0;
  return Math.min(questionCount - 1, Math.max(0, currentIndex + direction));
}

export type AssessmentTransitionResult =
  | { ok: true; assessment: AssessmentRecord; idempotent: boolean }
  | { ok: false; reason: "unsupported_transition" };

export function transitionAssessment(
  assessment: AssessmentRecord,
  nextStatus: AssessmentStatus,
  submittedAt: number,
): AssessmentTransitionResult {
  if (assessment.status === "submitted") {
    return { ok: true, assessment, idempotent: true };
  }
  if (nextStatus !== "submitted" || submittedAt < assessment.startedAt) {
    return { ok: false, reason: "unsupported_transition" };
  }
  return {
    ok: true,
    assessment: {
      ...assessment,
      status: "submitted",
      submittedAt,
      revision: assessment.revision + 1,
      lastMutationId: null,
    },
    idempotent: false,
  };
}

export function finalizeAssessment(
  assessment: AssessmentRecord,
  submittedAt: number,
): AssessmentRecord {
  if (assessment.status === "submitted") return assessment;
  return {
    ...assessment,
    status: "submitted",
    submittedAt,
    revision: assessment.revision + 1,
    lastMutationId: null,
  };
}

export function getSubmissionSummary(
  assessment: AssessmentRecord,
  timedOut: boolean,
): SubmissionSummary {
  const answered = assessment.questions.filter(
    (question) => assessment.answers[question.id] !== undefined,
  ).length;
  return {
    answered,
    unanswered: assessment.questions.length - answered,
    submittedAt: assessment.submittedAt ?? assessment.startedAt,
    timedOut,
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
    submittedAt: assessment.submittedAt,
    expiresAt: assessment.expiresAt,
    answers: { ...assessment.answers },
    revision: assessment.revision,
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
