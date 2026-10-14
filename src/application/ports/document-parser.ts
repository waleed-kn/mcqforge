import type { DocumentInput } from "@/domain/document";
import type { DocumentParseResult } from "@/domain/question";

export interface DocumentParser {
  parse(input: DocumentInput): Promise<DocumentParseResult>;
}
