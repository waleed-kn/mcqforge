import mammoth from "mammoth";
import type { ParsedSourcePage } from "@/domain/document";
import type { DocumentProcessingConfig } from "@/application/config/document-processing";
import { DocumentProcessingException } from "@/application/services/document-processing-error";

const ZIP_END_OF_CENTRAL_DIRECTORY = 0x06054b50;
const ZIP_CENTRAL_DIRECTORY_ENTRY = 0x02014b50;
const MAX_DOCX_ENTRIES = 1_000;
const MAX_DOCX_ENTRY_BYTES = 10 * 1_024 * 1_024;

function readUint32(data: Uint8Array, offset: number) {
  return new DataView(data.buffer, data.byteOffset, data.byteLength).getUint32(
    offset,
    true,
  );
}

function validateDocxArchiveSize(
  contents: Uint8Array,
  maxExpandedBytes: number,
) {
  const searchStart = Math.max(0, contents.length - 65_557);
  let endRecordOffset = -1;
  for (let offset = contents.length - 22; offset >= searchStart; offset -= 1) {
    if (
      offset + 4 <= contents.length &&
      readUint32(contents, offset) === ZIP_END_OF_CENTRAL_DIRECTORY
    ) {
      endRecordOffset = offset;
      break;
    }
  }
  if (endRecordOffset < 0 || endRecordOffset + 22 > contents.length) {
    throw new Error("The DOCX ZIP directory is missing or malformed.");
  }

  const view = new DataView(contents.buffer, contents.byteOffset, contents.byteLength);
  const entryCount = view.getUint16(endRecordOffset + 10, true);
  const centralDirectorySize = view.getUint32(endRecordOffset + 12, true);
  let entryOffset = view.getUint32(endRecordOffset + 16, true);
  const centralDirectoryEnd = entryOffset + centralDirectorySize;

  if (
    entryCount === 0xffff ||
    entryOffset === 0xffffffff ||
    centralDirectoryEnd > endRecordOffset ||
    entryCount > MAX_DOCX_ENTRIES
  ) {
    throw new Error("This DOCX archive uses an unsupported or excessive ZIP structure.");
  }

  let expandedBytes = 0;
  for (let index = 0; index < entryCount; index += 1) {
    if (
      entryOffset + 46 > centralDirectoryEnd ||
      readUint32(contents, entryOffset) !== ZIP_CENTRAL_DIRECTORY_ENTRY
    ) {
      throw new Error("The DOCX ZIP directory is malformed.");
    }

    const compressedSize = view.getUint32(entryOffset + 20, true);
    const uncompressedSize = view.getUint32(entryOffset + 24, true);
    const fileNameLength = view.getUint16(entryOffset + 28, true);
    const extraLength = view.getUint16(entryOffset + 30, true);
    const commentLength = view.getUint16(entryOffset + 32, true);
    const flags = view.getUint16(entryOffset + 8, true);
    if (flags & 1) {
      throw new Error("Encrypted DOCX archives are not supported.");
    }
    if (
      compressedSize === 0xffffffff ||
      uncompressedSize === 0xffffffff ||
      uncompressedSize > MAX_DOCX_ENTRY_BYTES
    ) {
      throw new Error("A DOCX archive entry exceeds the supported expansion limit.");
    }

    expandedBytes += uncompressedSize;
    if (expandedBytes > maxExpandedBytes) {
      throw new Error("The DOCX archive expands beyond the processing size limit.");
    }

    entryOffset += 46 + fileNameLength + extraLength + commentLength;
  }
}

export async function extractDocxText(
  contents: Uint8Array,
  config: DocumentProcessingConfig,
): Promise<{ pages: ParsedSourcePage[]; warnings: string[] }> {
  try {
    validateDocxArchiveSize(contents, config.maxDocxExpandedBytes);
  } catch (error) {
    const message =
      error instanceof Error
        ? error.message
        : "The DOCX archive could not be validated safely.";
    const encrypted = /encrypted/i.test(message);
    const limited = /exceeds|expands beyond|excessive/i.test(message);
    throw new DocumentProcessingException(
      {
        code: encrypted
          ? "encrypted_document"
          : limited
            ? "resource_limit"
            : "corrupt_document",
        message: encrypted
          ? "This DOCX archive is encrypted. Remove its password and save it as DOCX before uploading."
          : message,
      },
      limited ? 413 : 422,
    );
  }

  try {
    const result = await mammoth.extractRawText({
      buffer: Buffer.from(contents),
    });
    if (result.value.length > config.maxExtractedTextCharacters) {
      throw new DocumentProcessingException(
        {
          code: "resource_limit",
          message: `The extracted DOCX text exceeds ${config.maxExtractedTextCharacters.toLocaleString()} characters.`,
        },
        413,
      );
    }
    return {
      pages: [{ pageNumber: null, text: result.value }],
      warnings: result.messages
        .filter((message) => message.type === "warning")
        .map((message) => message.message),
    };
  } catch (error) {
    if (error instanceof DocumentProcessingException) throw error;
    throw new DocumentProcessingException(
      {
        code: "corrupt_document",
        message: "This DOCX file could not be read. Check that it is a valid Word document.",
      },
      422,
    );
  }
}
