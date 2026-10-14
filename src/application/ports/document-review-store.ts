import type { ReviewDocument } from "@/domain/review-document";
import type {
  DocumentProcessingWarning,
  UploadedDocumentMetadata,
} from "@/domain/document";
import type { MultipleChoiceQuestion } from "@/domain/question";

export type CreateReviewDocumentInput = {
  ownerId: string;
  metadata: UploadedDocumentMetadata;
  questions: MultipleChoiceQuestion[];
  warnings: DocumentProcessingWarning[];
  expiresAt: number;
};

export type ReviewMutationResult =
  | { status: "saved"; document: ReviewDocument; idempotent: boolean }
  | { status: "conflict"; document: ReviewDocument }
  | { status: "missing" };

export interface DocumentReviewStore {
  create(input: CreateReviewDocumentInput): Promise<ReviewDocument>;
  getOwned(documentId: string, ownerId: string): Promise<ReviewDocument | null>;
  updateQuestion(
    documentId: string,
    ownerId: string,
    questionId: string,
    expectedRevision: number,
    mutationId: string,
    question: Pick<MultipleChoiceQuestion, "prompt" | "options" | "correctOption">,
  ): Promise<ReviewMutationResult>;
  removeQuestion(
    documentId: string,
    ownerId: string,
    questionId: string,
    expectedRevision: number,
    mutationId: string,
  ): Promise<ReviewMutationResult>;
  confirm(
    documentId: string,
    ownerId: string,
    expectedRevision: number,
    mutationId: string,
  ): Promise<ReviewMutationResult>;
}
