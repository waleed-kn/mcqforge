import type { DocumentReviewStore } from "@/application/ports/document-review-store";
import { getStorageProvider } from "@/infrastructure/storage/storage-provider";

export function getDocumentReviewStore(): DocumentReviewStore {
  return getStorageProvider().documents;
}
