import type {
  AssessmentStore,
  CreateAssessmentInput,
  CreateAssessmentResult,
} from "@/application/ports/assessment-store";
import type { AssessmentRecord } from "@/domain/assessment";

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
    const assessment = this.assessments.get(assessmentId);
    if (!assessment || assessment.ownerId !== ownerId) return null;
    return assessment;
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
