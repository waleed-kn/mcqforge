import { z } from "zod";
import { supportedDocumentExtensions } from "../domain/document";

export const documentFileNameSchema = z
  .string()
  .trim()
  .min(1, "Choose a document.")
  .max(255, "The filename is too long.")
  .refine(
    (fileName) => {
      const extensionSeparator = fileName.lastIndexOf(".");
      if (extensionSeparator <= 0) return false;

      const extension = fileName.slice(extensionSeparator + 1).toLowerCase();
      return (
        supportedDocumentExtensions.some((supported) => supported === extension)
      );
    },
    { message: "Choose a PDF, DOCX, or TXT document." },
  );
