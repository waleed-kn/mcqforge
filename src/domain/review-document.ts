import type {
  DocumentProcessingWarning,
  UploadedDocumentMetadata,
} from "@/domain/document";
import type { MultipleChoiceQuestion } from "@/domain/question";

export type ReviewDocument = {
  metadata: UploadedDocumentMetadata;
  questions: MultipleChoiceQuestion[];
  warnings: DocumentProcessingWarning[];
  revision: number;
  confirmed: boolean;
  expiresAt: number;
};

export type ReviewSummary = {
  totalQuestions: number;
  validQuestions: number;
  questionsRequiringReview: number;
};

export function getReviewSummary(
  questions: readonly MultipleChoiceQuestion[],
): ReviewSummary {
  const validQuestions = questions.filter((question) => question.status === "valid").length;
  return {
    totalQuestions: questions.length,
    validQuestions,
    questionsRequiringReview: questions.length - validQuestions,
  };
}
