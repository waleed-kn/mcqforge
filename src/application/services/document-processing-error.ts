import type {
  DocumentProcessingError as DocumentProcessingErrorDetails,
} from "@/domain/document";

export class DocumentProcessingException extends Error {
  constructor(
    readonly details: DocumentProcessingErrorDetails,
    readonly httpStatus: number,
  ) {
    super(details.message);
    this.name = "DocumentProcessingException";
  }
}
