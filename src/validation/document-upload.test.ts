import { describe, expect, it } from "vitest";
import { documentFileNameSchema } from "./document-upload";

describe("documentFileNameSchema", () => {
  it.each(["notes.pdf", "questions.DOCX", "revision.txt"])(
    "accepts supported document filename %s",
    (fileName) => {
      expect(documentFileNameSchema.safeParse(fileName).success).toBe(true);
    },
  );

  it.each(["", "notes.doc", "questions.pdf.exe", ".txt", "x".repeat(256)])(
    "rejects unsupported or malformed filename %s",
    (fileName) => {
      expect(documentFileNameSchema.safeParse(fileName).success).toBe(false);
    },
  );
});
