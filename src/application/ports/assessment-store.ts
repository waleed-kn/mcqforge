import type {
  AssessmentRecord,
  SubmissionSummary,
} from "@/domain/assessment";
import type { AnswerOptionId } from "@/domain/question";

export type CreateAssessmentInput = AssessmentRecord;

export type CreateAssessmentResult =
  | { status: "created"; assessment: AssessmentRecord }
  | { status: "duplicate"; assessment: AssessmentRecord }
  | { status: "session_unavailable" }
  | { status: "conflict" };

export type AssessmentMutationResult =
  | { status: "saved"; assessment: AssessmentRecord; idempotent: boolean }
  | { status: "conflict"; assessment: AssessmentRecord }
  | {
      status: "submitted";
      assessment: AssessmentRecord;
      summary: SubmissionSummary;
      idempotent: boolean;
    }
  | { status: "missing" }
  | { status: "not_found" };

export interface AssessmentStore {
  create(input: CreateAssessmentInput): Promise<CreateAssessmentResult>;
  getOwned(assessmentId: string, ownerId: string): Promise<AssessmentRecord | null>;
  updateAnswer(
    assessmentId: string,
    ownerId: string,
    questionId: string,
    answer: AnswerOptionId,
    expectedRevision: number,
    mutationId: string,
    now: number,
  ): Promise<AssessmentMutationResult>;
  submit(
    assessmentId: string,
    ownerId: string,
    now: number,
  ): Promise<AssessmentMutationResult>;
}
