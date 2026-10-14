import { NextResponse } from "next/server";
import { processDocument } from "@/application/services/parse-document";
import { DocumentProcessingException } from "@/application/services/document-processing-error";

function jsonError(message: string, code: string, status: number) {
  return NextResponse.json({ error: { code, message } }, { status });
}

export async function POST(request: Request) {
  const declaredLength = Number(request.headers.get("content-length"));
  if (Number.isFinite(declaredLength) && declaredLength > 0) {
    try {
      const { getDocumentProcessingConfig } = await import(
        "@/application/config/document-processing"
      );
      if (declaredLength > getDocumentProcessingConfig().maxUploadBytes + 64 * 1_024) {
        return jsonError(
          "The upload is larger than the configured file size limit.",
          "resource_limit",
          413,
        );
      }
    } catch (error) {
      return jsonError(
        error instanceof Error
          ? error.message
          : "Document processing is not configured correctly.",
        "configuration_error",
        500,
      );
    }
  }

  let formData: FormData;
  try {
    formData = await request.formData();
  } catch {
    return jsonError(
      "The request must contain a multipart form with a document file.",
      "invalid_request",
      400,
    );
  }

  const file = formData.get("file");
  if (!(file instanceof File)) {
    return jsonError(
      "Choose a PDF, DOCX, or TXT document to continue.",
      "missing_file",
      400,
    );
  }

  try {
    const result = await processDocument({
      fileName: file.name,
      mediaType: file.type,
      contents: new Uint8Array(await file.arrayBuffer()),
    });
    return NextResponse.json(result);
  } catch (error) {
    if (error instanceof DocumentProcessingException) {
      return jsonError(
        error.details.message,
        error.details.code,
        error.httpStatus,
      );
    }
    return jsonError(
      "The document could not be processed. Try a different file or format.",
      "processing_failed",
      500,
    );
  }
}
