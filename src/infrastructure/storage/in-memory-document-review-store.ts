import type {
  CreateReviewDocumentInput,
  DocumentReviewStore,
  ReviewMutationResult,
} from "@/application/ports/document-review-store";
import type { SessionStore } from "@/application/ports/session-store";
import { applyQuestionEdits } from "@/application/services/review-question";
import type { ReviewDocument } from "@/domain/review-document";
import { StorageUnavailableError } from "@/infrastructure/storage/storage-error";

type StoredReviewDocument = ReviewDocument & {
  ownerId: string;
  lastMutationId: string | null;
};

export class InMemoryDocumentReviewStore implements DocumentReviewStore {
  private readonly documents = new Map<string, StoredReviewDocument>();

  constructor(private readonly sessions?: SessionStore) {}

  async create(input: CreateReviewDocumentInput): Promise<ReviewDocument> {
    if (this.sessions && !(await this.sessions.get(input.ownerId, Date.now()))) {
      throw new StorageUnavailableError();
    }
    this.pruneExpired();
    const document: StoredReviewDocument = {
      metadata: input.metadata,
      questions: input.questions,
      warnings: input.warnings,
      revision: 0,
      confirmed: false,
      expiresAt: input.expiresAt,
      ownerId: input.ownerId,
      lastMutationId: null,
    };
    this.documents.set(input.metadata.id, document);
    return this.toPublicDocument(document);
  }

  async getOwned(
    documentId: string,
    ownerId: string,
  ): Promise<ReviewDocument | null> {
    this.pruneExpired();
    if (this.sessions && !(await this.sessions.get(ownerId, Date.now()))) return null;
    const document = this.documents.get(documentId);
    if (!document || document.ownerId !== ownerId) return null;
    return this.toPublicDocument(document);
  }

  async updateQuestion(
    documentId: string,
    ownerId: string,
    questionId: string,
    expectedRevision: number,
    mutationId: string,
    question: Parameters<typeof applyQuestionEdits>[1],
  ): Promise<ReviewMutationResult> {
    return this.mutate(
      documentId,
      ownerId,
      expectedRevision,
      mutationId,
      (document) => {
        const questionIndex = document.questions.findIndex(
          (candidate) => candidate.id === questionId,
        );
        if (questionIndex < 0) return null;
        const questions = [...document.questions];
        questions[questionIndex] = applyQuestionEdits(
          questions[questionIndex],
          question,
        );
        return { ...document, questions, confirmed: false };
      },
    );
  }

  async removeQuestion(
    documentId: string,
    ownerId: string,
    questionId: string,
    expectedRevision: number,
    mutationId: string,
  ): Promise<ReviewMutationResult> {
    return this.mutate(
      documentId,
      ownerId,
      expectedRevision,
      mutationId,
      (document) => {
        const questions = document.questions.filter(
          (question) => question.id !== questionId,
        );
        if (questions.length === document.questions.length) return null;
        return { ...document, questions, confirmed: false };
      },
    );
  }

  async confirm(
    documentId: string,
    ownerId: string,
    expectedRevision: number,
    mutationId: string,
  ): Promise<ReviewMutationResult> {
    return this.mutate(
      documentId,
      ownerId,
      expectedRevision,
      mutationId,
      (document) => ({ ...document, confirmed: true }),
    );
  }

  private async mutate(
    documentId: string,
    ownerId: string,
    expectedRevision: number,
    mutationId: string,
    update: (
      document: StoredReviewDocument,
    ) => Omit<StoredReviewDocument, "revision" | "lastMutationId"> | null,
  ): Promise<ReviewMutationResult> {
    this.pruneExpired();
    if (this.sessions && !(await this.sessions.get(ownerId, Date.now()))) {
      return { status: "missing" };
    }
    const current = this.documents.get(documentId);
    if (!current || current.ownerId !== ownerId) return { status: "missing" };

    if (current.lastMutationId === mutationId) {
      return {
        status: "saved",
        document: this.toPublicDocument(current),
        idempotent: true,
      };
    }
    if (current.revision !== expectedRevision) {
      return { status: "conflict", document: this.toPublicDocument(current) };
    }

    const updated = update(current);
    if (!updated) return { status: "missing" };
    const saved: StoredReviewDocument = {
      ...updated,
      revision: current.revision + 1,
      lastMutationId: mutationId,
    };
    this.documents.set(documentId, saved);
    return {
      status: "saved",
      document: this.toPublicDocument(saved),
      idempotent: false,
    };
  }

  private pruneExpired() {
    const now = Date.now();
    for (const [documentId, document] of this.documents) {
      if (document.expiresAt <= now) this.documents.delete(documentId);
    }
  }

  private toPublicDocument(document: StoredReviewDocument): ReviewDocument {
    return {
      metadata: document.metadata,
      questions: document.questions,
      warnings: document.warnings,
      revision: document.revision,
      confirmed: document.confirmed,
      expiresAt: document.expiresAt,
    };
  }
}
