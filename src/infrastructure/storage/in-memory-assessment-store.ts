import type {
  AssessmentMutationResult,
  AssessmentStore,
  CreateAssessmentInput,
  CreateAssessmentResult,
} from "@/application/ports/assessment-store";
import type { AssessmentRecord } from "@/domain/assessment";
import { finalizeAssessment, getSubmissionSummary } from "@/domain/assessment";
import type { AnswerOptionId } from "@/domain/question";

export class InMemoryAssessmentStore implements AssessmentStore {
  private readonly assessments = new Map<string, AssessmentRecord>();
  private readonly requests = new Map<string, string>();

  async create(input: CreateAssessmentInput): Promise<CreateAssessmentResult> {
    this.pruneExpired();
    const requestKey = `${input.ownerId}:${input.requestId}`;
    const existingId = this.requests.get(requestKey);
    if (existingId) {
      const existing = this.assessments.get(existingId);
      if (!existing) {
        this.requests.delete(requestKey);
      } else if (
        existing.documentId === input.documentId &&
        JSON.stringify(existing.configuration) === JSON.stringify(input.configuration)
      ) {
        return { status: "duplicate", assessment: existing };
      } else {
        return { status: "conflict" };
      }
    }
    this.assessments.set(input.id, input);
    this.requests.set(requestKey, input.id);
    return { status: "created", assessment: input };
  }

  async getOwned(
    assessmentId: string,
    ownerId: string,
  ): Promise<AssessmentRecord | null> {
    this.pruneExpired();
    let assessment = this.assessments.get(assessmentId);
    if (!assessment || assessment.ownerId !== ownerId) return null;
    if (
      assessment.status === "in_progress" &&
      assessment.deadline !== null &&
      Date.now() >= assessment.deadline
    ) {
      assessment = finalizeAssessment(assessment, Date.now());
      this.assessments.set(assessmentId, assessment);
    }
    return assessment;
  }

  async updateAnswer(
    assessmentId: string,
    ownerId: string,
    questionId: string,
    answer: AnswerOptionId,
    expectedRevision: number,
    mutationId: string,
    now: number,
  ): Promise<AssessmentMutationResult> {
    this.pruneExpired();
    const assessment = this.assessments.get(assessmentId);
    if (!assessment || assessment.ownerId !== ownerId) return { status: "not_found" };

    if (assessment.status === "submitted") {
      return {
        status: "submitted",
        assessment,
        summary: getSubmissionSummary(assessment, this.isTimedOut(assessment)),
        idempotent: false,
      };
    }
    if (assessment.deadline !== null && now >= assessment.deadline) {
      const submitted = finalizeAssessment(assessment, now);
      this.assessments.set(assessmentId, submitted);
      return {
        status: "submitted",
        assessment: submitted,
        summary: getSubmissionSummary(submitted, true),
        idempotent: false,
      };
    }
    if (!assessment.questions.some((question) => question.id === questionId)) {
      return { status: "missing" };
    }
    if (assessment.lastMutationId === mutationId) {
      return { status: "saved", assessment, idempotent: true };
    }
    if (assessment.revision !== expectedRevision) {
      return { status: "conflict", assessment };
    }
    const updated: AssessmentRecord = {
      ...assessment,
      answers: { ...assessment.answers, [questionId]: answer },
      revision: assessment.revision + 1,
      lastMutationId: mutationId,
    };
    this.assessments.set(assessmentId, updated);
    return { status: "saved", assessment: updated, idempotent: false };
  }

  async submit(
    assessmentId: string,
    ownerId: string,
    now: number,
  ): Promise<AssessmentMutationResult> {
    this.pruneExpired();
    const assessment = this.assessments.get(assessmentId);
    if (!assessment || assessment.ownerId !== ownerId) return { status: "not_found" };
    const idempotent = assessment.status === "submitted";
    const submitted = idempotent ? assessment : finalizeAssessment(assessment, now);
    if (!idempotent) this.assessments.set(assessmentId, submitted);
    return {
      status: "submitted",
      assessment: submitted,
      summary: getSubmissionSummary(submitted, this.isTimedOut(submitted)),
      idempotent,
    };
  }

  private isTimedOut(assessment: AssessmentRecord): boolean {
    return (
      assessment.deadline !== null &&
      assessment.submittedAt !== null &&
      assessment.submittedAt >= assessment.deadline
    );
  }

  private pruneExpired() {
    const now = Date.now();
    for (const [assessmentId, assessment] of this.assessments) {
      if (assessment.expiresAt <= now) {
        this.assessments.delete(assessmentId);
        this.requests.delete(`${assessment.ownerId}:${assessment.requestId}`);
      }
    }
  }
}
