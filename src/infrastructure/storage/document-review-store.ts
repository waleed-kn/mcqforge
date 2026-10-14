import type { DocumentReviewStore } from "@/application/ports/document-review-store";
import { InMemoryDocumentReviewStore } from "@/infrastructure/storage/in-memory-document-review-store";

const globalForDocumentReview = globalThis as typeof globalThis & {
  mcqforgeDocumentReviewStore?: InMemoryDocumentReviewStore;
};

export function getDocumentReviewStore(): DocumentReviewStore {
  globalForDocumentReview.mcqforgeDocumentReviewStore ??=
    new InMemoryDocumentReviewStore();
  return globalForDocumentReview.mcqforgeDocumentReviewStore;
}
