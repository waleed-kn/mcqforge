import type { AssessmentStore } from "@/application/ports/assessment-store";
import { getStorageProvider } from "@/infrastructure/storage/storage-provider";

export function getAssessmentStore(): AssessmentStore {
  return getStorageProvider().assessments;
}
