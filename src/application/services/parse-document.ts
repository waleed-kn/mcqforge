import { randomUUID } from "node:crypto";
import type {
  DocumentInput,
  DocumentProcessingStatus,
  DocumentProcessingWarning,
  ParsedSourcePage,
  SupportedDocumentExtension,
  UploadedDocumentMetadata,
} from "@/domain/document";
import type { DocumentParseResult } from "@/domain/question";
import { getDocumentProcessingConfig } from "@/application/config/document-processing";
import { DocumentProcessingException } from "@/application/services/document-processing-error";
import { extractMultipleChoiceQuestions } from "@/application/services/mcq-extractor";
import { normalizeSourcePages } from "@/application/services/document-text-normalizer";
import { extractDocxText } from "@/infrastructure/document-parsers/docx-text-parser";
import { extractPdfPages } from "@/infrastructure/document-parsers/pdf-text-parser";
import { documentFileNameSchema } from "@/validation/document-upload";

const mimeTypesByExtension: Record<SupportedDocumentExtension, readonly string[]> = {
  pdf: ["application/pdf", "application/octet-stream"],
  docx: [
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    "application/octet-stream",
    "application/zip",
  ],
  txt: ["text/plain", "application/octet-stream"],
};

export type ProcessedDocument = {
  status: Extract<DocumentProcessingStatus, "completed">;
  metadata: UploadedDocumentMetadata;
  questions: DocumentParseResult["questions"];
  warnings: DocumentProcessingWarning[];
  totalQuestions: number;
  validQuestions: number;
  questionsRequiringReview: number;
};

function fail(
  code: ConstructorParameters<typeof DocumentProcessingException>[0]["code"],
  message: string,
  status: number,
): never {
  throw new DocumentProcessingException({ code, message }, status);
}

function getExtension(fileName: string): SupportedDocumentExtension {
  const extension = fileName.slice(fileName.lastIndexOf(".") + 1).toLowerCase();
  if (extension === "pdf" || extension === "docx" || extension === "txt") {
    return extension;
  }
  return fail(
    "unsupported_type",
    "Choose a PDF, DOCX, or TXT document.",
    415,
  );
}

function validateMimeType(
  extension: SupportedDocumentExtension,
  mediaType: string,
) {
  const normalizedMediaType = mediaType.split(";")[0].trim().toLowerCase();
  if (
    normalizedMediaType &&
    !mimeTypesByExtension[extension].includes(normalizedMediaType)
  ) {
    fail(
      "mime_type_mismatch",
      `The selected file's media type does not match its .${extension} extension.`,
      415,
    );
  }
}

function validateFileSignature(
  extension: SupportedDocumentExtension,
  contents: Uint8Array,
) {
  if (extension === "pdf") {
    const header = new TextDecoder("latin1").decode(contents.subarray(0, 1_024));
    if (!header.includes("%PDF-")) {
      fail(
        "invalid_signature",
        "The file does not have a valid PDF signature. Choose a genuine PDF file.",
        415,
      );
    }
  } else if (extension === "docx") {
    if (
      contents.length >= 8 &&
      contents[0] === 0xd0 &&
      contents[1] === 0xcf &&
      contents[2] === 0x11 &&
      contents[3] === 0xe0
    ) {
      fail(
        "encrypted_document",
        "This Word document is password-protected. Remove its password and save it as DOCX before uploading.",
        422,
      );
    }
    if (
      contents.length < 4 ||
      contents[0] !== 0x50 ||
      contents[1] !== 0x4b ||
      contents[2] !== 0x03 ||
      contents[3] !== 0x04
    ) {
      fail(
        "invalid_signature",
        "The file does not have a valid DOCX signature. Choose a genuine Word document.",
        415,
      );
    }
  } else if (contents.includes(0)) {
    fail(
      "invalid_signature",
      "The selected TXT file contains binary data and cannot be read as plain text.",
      415,
    );
  }
}

function extractTextFile(contents: Uint8Array): ParsedSourcePage[] {
  try {
    return [{ pageNumber: null, text: new TextDecoder("utf-8", { fatal: true }).decode(contents) }];
  } catch {
    return fail(
      "corrupt_document",
      "This TXT file is not valid UTF-8 text. Save it as UTF-8 and try again.",
      422,
    );
  }
}

function combineWarnings(
  warnings: DocumentProcessingWarning[],
  parserWarnings: readonly string[],
) {
  for (const message of parserWarnings) {
    warnings.push({ code: "parser_warning", message });
  }
}

export async function processDocument(input: DocumentInput): Promise<ProcessedDocument> {
  const config = getDocumentProcessingConfig();
  const fileNameResult = documentFileNameSchema.safeParse(input.fileName);
  if (!fileNameResult.success) {
    return fail("unsupported_type", "Choose a PDF, DOCX, or TXT document.", 415);
  }
  if (input.contents.length === 0) {
    return fail("empty_file", "The selected file is empty.", 422);
  }
  if (input.contents.length > config.maxUploadBytes) {
    return fail(
      "resource_limit",
      `The file is too large. The upload limit is ${Math.floor(config.maxUploadBytes / 1_024 / 1_024)} MB.`,
      413,
    );
  }

  const extension = getExtension(fileNameResult.data);
  validateMimeType(extension, input.mediaType);
  validateFileSignature(extension, input.contents);

  let pages: ParsedSourcePage[];
  const parserWarnings: string[] = [];
  if (extension === "pdf") {
    pages = await extractPdfPages(input.contents, config);
    if (!pages.some((page) => page.text.trim())) {
      return fail(
        "ocr_unsupported",
        "No selectable text was found in this PDF. Scanned or image-only PDFs need OCR, which is not supported.",
        422,
      );
    }
  } else if (extension === "docx") {
    const extracted = await extractDocxText(input.contents, config);
    pages = extracted.pages;
    parserWarnings.push(...extracted.warnings);
  } else {
    pages = extractTextFile(input.contents);
  }

  pages = normalizeSourcePages(pages);
  const fullText = pages.map((page) => page.text).filter(Boolean).join("\n\n");
  if (!fullText) {
    return fail(
      "empty_text",
      "No readable text was found in this document.",
      422,
    );
  }
  if (fullText.length > config.maxExtractedTextCharacters) {
    return fail(
      "resource_limit",
      `The extracted text exceeds ${config.maxExtractedTextCharacters.toLocaleString()} characters.`,
      413,
    );
  }

  const parsed = extractMultipleChoiceQuestions(pages);
  combineWarnings(parsed.warnings, parserWarnings);
  return {
    status: "completed",
    metadata: {
      id: randomUUID(),
      fileName: fileNameResult.data,
      mediaType: input.mediaType,
      extension,
      sizeBytes: input.contents.length,
    },
    questions: parsed.questions,
    warnings: parsed.warnings,
    totalQuestions: parsed.questions.length,
    validQuestions: parsed.questions.filter((question) => question.status === "valid").length,
    questionsRequiringReview: parsed.questions.filter(
      (question) => question.status === "needs_review",
    ).length,
  };
}
