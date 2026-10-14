import { z } from "zod";

const maxUploadBytesSchema = z.coerce
  .number()
  .int()
  .min(1_024)
  .max(50 * 1_024 * 1_024);

export type DocumentProcessingConfig = {
  maxUploadBytes: number;
  maxPdfPages: number;
  maxExtractedTextCharacters: number;
  maxDocxExpandedBytes: number;
};

export function getDocumentProcessingConfig(): DocumentProcessingConfig {
  const result = maxUploadBytesSchema.safeParse(
    process.env.MAX_DOCUMENT_UPLOAD_BYTES ?? 4 * 1_024 * 1_024,
  );

  if (!result.success) {
    throw new Error(
      "MAX_DOCUMENT_UPLOAD_BYTES must be an integer between 1024 and 52428800.",
    );
  }

  return {
    maxUploadBytes: result.data,
    maxPdfPages: 300,
    maxExtractedTextCharacters: 1_000_000,
    maxDocxExpandedBytes: 20 * 1_024 * 1_024,
  };
}
