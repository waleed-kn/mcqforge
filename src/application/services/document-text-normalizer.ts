import type { ParsedSourcePage } from "@/domain/document";

export function normalizeExtractedText(text: string): string {
  return text
    .replace(/^\uFEFF/, "")
    .replace(/\r\n?/g, "\n")
    .replace(/[\u00a0\u2007\u202f]/g, " ")
    .replace(/[\u200b-\u200d\u2060]/g, "")
    .split("\n")
    .map((line) => line.replace(/[ \t]+/g, " ").trim())
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

export function normalizeSourcePages(
  pages: readonly ParsedSourcePage[],
): ParsedSourcePage[] {
  return pages.map((page) => ({
    pageNumber: page.pageNumber,
    text: normalizeExtractedText(page.text),
  }));
}
