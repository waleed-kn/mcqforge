import { NextResponse, type NextRequest } from "next/server";
import { getAuthenticatedSession, isSameOriginMutation } from "@/application/services/review-session";
import { csrfRejectedResponse, withStorageErrorHandling } from "@/application/services/api-security";
import {
  reviewErrorResponse,
  reviewMutationResponse,
} from "@/application/services/review-api";
import { getReviewSummary } from "@/domain/review-document";
import { getDocumentReviewStore } from "@/infrastructure/storage/document-review-store";
import { reviewMutationSchema } from "@/validation/document-review";
import { resourceIdSchema } from "@/validation/identifiers";

type RouteContext = {
  params: Promise<{ documentId: string }>;
};

export const POST = withStorageErrorHandling(async function POST(request: NextRequest, context: RouteContext) {
  if (!isSameOriginMutation(request)) return csrfRejectedResponse();
  const { documentId } = await context.params;
  if (!resourceIdSchema.safeParse(documentId).success) {
    return reviewErrorResponse("The document ID is invalid.", "invalid_document_id", 400);
  }
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return reviewErrorResponse("The confirmation request was not valid JSON.", "invalid_request", 400);
  }
  const parsed = reviewMutationSchema.safeParse(body);
  if (!parsed.success || parsed.data.question) {
    return reviewErrorResponse(
      "The confirmation request is invalid. Save any pending edits and try again.",
      "invalid_request",
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
  const ownerId = session.id;
  const store = getDocumentReviewStore();
  const current = await store.getOwned(documentId, ownerId);
  if (!current) {
    return reviewErrorResponse(
      "This review document is unavailable or has expired. Upload it again to continue.",
      "document_unavailable",
      410,
    );
  }
  const summary = getReviewSummary(current.questions);
  if (summary.validQuestions === 0) {
    return NextResponse.json(
      {
        error: {
          code: "no_valid_questions",
          message: "At least one complete question with a correct answer is required before continuing.",
        },
        summary,
      },
      { status: 422 },
    );
  }

  const result = await store.confirm(
    documentId,
    ownerId,
    parsed.data.expectedRevision,
    parsed.data.mutationId,
  );
  if (result.status === "missing") {
    return reviewErrorResponse("This review document has expired.", "document_unavailable", 410);
  }
  if (result.status === "conflict") {
    return NextResponse.json(
      {
        error: {
          code: "revision_conflict",
          message: "The review changed in another request. Reload and confirm again.",
        },
        document: result.document,
      },
      { status: 409 },
    );
  }
  return reviewMutationResponse(result.document, result.idempotent);
});
