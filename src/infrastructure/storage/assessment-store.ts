import type { AssessmentStore } from "@/application/ports/assessment-store";
import { InMemoryAssessmentStore } from "@/infrastructure/storage/in-memory-assessment-store";

const globalForAssessment = globalThis as typeof globalThis & {
  mcqforgeAssessmentStore?: InMemoryAssessmentStore;
};

export function getAssessmentStore(): AssessmentStore {
  globalForAssessment.mcqforgeAssessmentStore ??= new InMemoryAssessmentStore();
  return globalForAssessment.mcqforgeAssessmentStore;
}
