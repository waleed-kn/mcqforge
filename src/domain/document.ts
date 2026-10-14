export const supportedDocumentExtensions = ["pdf", "docx", "txt"] as const;

export type SupportedDocumentExtension =
  (typeof supportedDocumentExtensions)[number];

export type DocumentProcessingStatus =
  | "received"
  | "extracting"
  | "completed"
  | "failed";

export type UploadedDocumentMetadata = {
  id: string;
  fileName: string;
  mediaType: string;
  extension: SupportedDocumentExtension;
  sizeBytes: number;
};

export type ParsedSourcePage = {
  pageNumber: number | null;
  text: string;
};

export type ParsedSourceText = {
  pages: ParsedSourcePage[];
  fullText: string;
};

export type DocumentInput = {
  fileName: string;
  mediaType: string;
  contents: Uint8Array;
};

export type DocumentProcessingWarning = {
  code:
    | "unrecognized_content"
    | "invalid_answer_reference"
    | "parser_warning"
    | "no_questions";
  message: string;
};

export type DocumentProcessingError = {
  code:
    | "empty_file"
    | "unsupported_type"
    | "mime_type_mismatch"
    | "invalid_signature"
    | "corrupt_document"
    | "encrypted_document"
    | "empty_text"
    | "ocr_unsupported"
    | "resource_limit";
  message: string;
};
