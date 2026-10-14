export const supportedDocumentExtensions = ["pdf", "docx", "txt"] as const;

export type SupportedDocumentExtension =
  (typeof supportedDocumentExtensions)[number];

export type DocumentInput = {
  fileName: string;
  mediaType: string;
  contents: Uint8Array;
};
