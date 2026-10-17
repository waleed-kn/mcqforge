import { NextResponse, type NextRequest } from "next/server";
import {
  reviewDocumentTtlSeconds,
  reviewQuestionLimit,
} from "@/application/config/document-review";
import { processDocument } from "@/application/services/parse-document";
import { DocumentProcessingException } from "@/application/services/document-processing-error";
import {
  consumeRequestRateLimit,
  createAnonymousSession,
  getAuthenticatedSession,
  getSessionIdFromRequest,
  isSameOriginMutation,
  setSessionCookie,
} from "@/application/services/review-session";
import { getDocumentReviewStore } from "@/infrastructure/storage/document-review-store";
import { withStorageErrorHandling, rateLimitedResponse } from "@/application/services/api-security";
import {
  StorageRecordTooLargeError,
  StorageUnavailableError,
} from "@/infrastructure/storage/storage-error";

function jsonError(message: string, code: string, status: number) {
  return NextResponse.json({ error: { code, message } }, { status });
}

export const POST = withStorageErrorHandling(async function POST(request: NextRequest) {
  if (!isSameOriginMutation(request)) {
    return jsonError("The upload origin could not be verified.", "csrf_rejected", 403);
  }
  if (!(await consumeRequestRateLimit(request, "upload", getSessionIdFromRequest(request) ?? undefined))) {
    return rateLimitedResponse();
  }
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
    if (result.questions.length > reviewQuestionLimit) {
      return jsonError(
        `This document contains more than ${reviewQuestionLimit} detected questions. Split it into smaller documents and try again.`,
        "resource_limit",
        413,
      );
    }
    const existingSession = await getAuthenticatedSession(request);
    const session = existingSession ?? await createAnonymousSession();
    await getDocumentReviewStore().create({
      ownerId: session.id,
      metadata: result.metadata,
      questions: result.questions,
      warnings: result.warnings,
      expiresAt: Math.min(
        Date.now() + reviewDocumentTtlSeconds * 1_000,
        session.expiresAt,
      ),
    });
    const response = NextResponse.json({
      documentId: result.metadata.id,
      fileName: result.metadata.fileName,
      revision: 0,
      summary: {
        totalQuestions: result.totalQuestions,
        validQuestions: result.validQuestions,
        questionsRequiringReview: result.questionsRequiringReview,
      },
    });
    if (!existingSession) setSessionCookie(response, session.id);
    return response;
  } catch (error) {
    if (error instanceof StorageUnavailableError) throw error;
    if (error instanceof StorageRecordTooLargeError) {
      return jsonError(
        "This document creates a temporary question set larger than the configured storage limit. Split it into smaller documents and try again.",
        "storage_record_too_large",
        413,
      );
    }
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
});
