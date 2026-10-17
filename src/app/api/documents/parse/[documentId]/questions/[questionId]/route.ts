import { NextResponse, type NextRequest } from "next/server";
import { getAuthenticatedSession, isSameOriginMutation } from "@/application/services/review-session";
import { csrfRejectedResponse, withStorageErrorHandling } from "@/application/services/api-security";
import {
  reviewErrorResponse,
  reviewMutationResponse,
} from "@/application/services/review-api";
import { getDocumentReviewStore } from "@/infrastructure/storage/document-review-store";
import { reviewMutationSchema } from "@/validation/document-review";
import { resourceIdSchema } from "@/validation/identifiers";

type RouteContext = {
  params: Promise<{ documentId: string; questionId: string }>;
};

async function parseMutation(request: NextRequest) {
  try {
    const body: unknown = await request.json();
    const result = reviewMutationSchema.safeParse(body);
    if (!result.success) return { data: null, error: "Review changes are invalid. Check the question fields and try again." };
    return { data: result.data, error: null };
  } catch {
    return { data: null, error: "The save request was not valid JSON." };
  }
}

export const PATCH = withStorageErrorHandling(async function PATCH(request: NextRequest, context: RouteContext) {
  if (!isSameOriginMutation(request)) return csrfRejectedResponse();
  const { documentId, questionId } = await context.params;
  if (
    !resourceIdSchema.safeParse(documentId).success ||
    !resourceIdSchema.safeParse(questionId).success
  ) {
    return reviewErrorResponse("The document or question ID is invalid.", "invalid_resource_id", 400);
  }
  const mutation = await parseMutation(request);
  if (!mutation.data || !mutation.data.question) {
    return reviewErrorResponse(
      mutation.error ?? "Question edits are required.",
      "invalid_edits",
      400,
    );
  }

  const session = await getAuthenticatedSession(request);
  if (!session) {
    return reviewErrorResponse(
      "Your temporary session is unavailable or has expired.",
      "session_unavailable",
      401,
    );
  }
  const result = await getDocumentReviewStore().updateQuestion(
    documentId,
    session.id,
    questionId,
    mutation.data.expectedRevision,
    mutation.data.mutationId,
    mutation.data.question,
  );
  if (result.status === "missing") {
    return reviewErrorResponse(
      "This review document or question is unavailable or has expired.",
      "document_unavailable",
      410,
    );
  }
  if (result.status === "conflict") {
    return NextResponse.json(
      {
        error: {
          code: "revision_conflict",
          message: "The review changed in another request. Reload the latest version before saving.",
        },
        document: result.document,
      },
      { status: 409 },
    );
  }
  return reviewMutationResponse(result.document, result.idempotent);
});

export const DELETE = withStorageErrorHandling(async function DELETE(request: NextRequest, context: RouteContext) {
  if (!isSameOriginMutation(request)) return csrfRejectedResponse();
  const { documentId, questionId } = await context.params;
  if (
    !resourceIdSchema.safeParse(documentId).success ||
    !resourceIdSchema.safeParse(questionId).success
  ) {
    return reviewErrorResponse("The document or question ID is invalid.", "invalid_resource_id", 400);
  }
  const mutation = await parseMutation(request);
  if (!mutation.data || mutation.data.question) {
    return reviewErrorResponse(
      mutation.error ?? "Removal requests cannot include question edits.",
      "invalid_edits",
      400,
    );
  }

  const session = await getAuthenticatedSession(request);
  if (!session) {
    return reviewErrorResponse(
      "Your temporary session is unavailable or has expired.",
      "session_unavailable",
      401,
    );
  }
  const result = await getDocumentReviewStore().removeQuestion(
    documentId,
    session.id,
    questionId,
    mutation.data.expectedRevision,
    mutation.data.mutationId,
  );
  if (result.status === "missing") {
    return reviewErrorResponse(
      "This review document or question is unavailable or has expired.",
      "document_unavailable",
      410,
    );
  }
  if (result.status === "conflict") {
    return NextResponse.json(
      {
        error: {
          code: "revision_conflict",
          message: "The review changed in another request. Reload the latest version before removing a question.",
        },
        document: result.document,
      },
      { status: 409 },
    );
  }
  return reviewMutationResponse(result.document, result.idempotent);
});
