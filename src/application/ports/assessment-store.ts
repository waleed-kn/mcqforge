import type { AssessmentRecord } from "@/domain/assessment";

export type CreateAssessmentInput = AssessmentRecord;

export type CreateAssessmentResult =
  | { status: "created"; assessment: AssessmentRecord }
  | { status: "duplicate"; assessment: AssessmentRecord }
  | { status: "conflict" };

export interface AssessmentStore {
  create(input: CreateAssessmentInput): Promise<CreateAssessmentResult>;
  getOwned(assessmentId: string, ownerId: string): Promise<AssessmentRecord | null>;
}
