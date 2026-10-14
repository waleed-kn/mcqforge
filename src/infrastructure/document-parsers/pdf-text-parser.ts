import type { ParsedSourcePage } from "@/domain/document";
import type { DocumentProcessingConfig } from "@/application/config/document-processing";
import { DocumentProcessingException } from "@/application/services/document-processing-error";

type PdfTextItem = {
  str: string;
  transform: number[];
  hasEOL: boolean;
};

function isPdfTextItem(item: unknown): item is PdfTextItem {
  if (!item || typeof item !== "object") return false;
  return (
    "str" in item &&
    typeof item.str === "string" &&
    "transform" in item &&
    Array.isArray(item.transform)
  );
}

function pageTextFromItems(items: readonly unknown[]) {
  const lines: string[] = [];
  let currentLine = "";
  let baseline: number | null = null;

  function flushLine() {
    if (currentLine.trim()) lines.push(currentLine.trim());
    currentLine = "";
    baseline = null;
  }

  for (const item of items) {
    if (!isPdfTextItem(item)) continue;

    const itemBaseline = item.transform[5];
    if (
      baseline !== null &&
      typeof itemBaseline === "number" &&
      Math.abs(baseline - itemBaseline) > 2
    ) {
      flushLine();
    }

    if (baseline === null && typeof itemBaseline === "number") {
      baseline = itemBaseline;
    }
    if (item.str) currentLine += `${currentLine ? " " : ""}${item.str}`;
    if (item.hasEOL) flushLine();
  }
  flushLine();
  return lines.join("\n");
}

export async function extractPdfPages(
  contents: Uint8Array,
  config: DocumentProcessingConfig,
): Promise<ParsedSourcePage[]> {
  const pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs");
  const loadingTask = pdfjs.getDocument({
    data: Uint8Array.from(contents),
    useSystemFonts: true,
  });

  try {
    const document = await loadingTask.promise;
    if (document.numPages > config.maxPdfPages) {
      throw new DocumentProcessingException(
        {
          code: "resource_limit",
          message: `This PDF has ${document.numPages} pages. The limit is ${config.maxPdfPages} pages.`,
        },
        413,
      );
    }

    const pages: ParsedSourcePage[] = [];
    let characterCount = 0;
    for (let pageNumber = 1; pageNumber <= document.numPages; pageNumber += 1) {
      const page = await document.getPage(pageNumber);
      const content = await page.getTextContent();
      const text = pageTextFromItems(content.items);
      characterCount += text.length;
      if (characterCount > config.maxExtractedTextCharacters) {
        throw new DocumentProcessingException(
          {
            code: "resource_limit",
            message: `The extracted PDF text exceeds ${config.maxExtractedTextCharacters.toLocaleString()} characters.`,
          },
          413,
        );
      }
      pages.push({ pageNumber, text });
      page.cleanup();
    }
    return pages;
  } catch (error) {
    if (error instanceof DocumentProcessingException) throw error;
    const message = error instanceof Error ? error.message : "";
    const encrypted =
      /password|encrypted/i.test(message) ||
      (typeof error === "object" &&
        error !== null &&
        "name" in error &&
        error.name === "PasswordException");
    throw new DocumentProcessingException(
      {
        code: encrypted ? "encrypted_document" : "corrupt_document",
        message: encrypted
          ? "This PDF is password-protected. Remove its password and try again."
          : "This PDF could not be read. Check that it is a valid, uncorrupted PDF.",
      },
      422,
    );
  } finally {
    await loadingTask.destroy();
  }
}
