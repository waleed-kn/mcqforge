import { NextResponse, type NextRequest } from "next/server";
import { requireAuthenticatedSession, withStorageErrorHandling } from "@/application/services/api-security";
import {
  reviewDocumentResponse,
  reviewErrorResponse,
} from "@/application/services/review-api";
import { getDocumentReviewStore } from "@/infrastructure/storage/document-review-store";
import { resourceIdSchema } from "@/validation/identifiers";

type RouteContext = {
  params: Promise<{ documentId: string }>;
};

export const GET = withStorageErrorHandling(async function GET(request: NextRequest, context: RouteContext) {
  const { documentId } = await context.params;
  if (!resourceIdSchema.safeParse(documentId).success) {
    return NextResponse.json(
      { error: { code: "invalid_document_id", message: "The document ID is invalid." } },
      { status: 400 },
    );
  }
  const { sessionId, response } = await requireAuthenticatedSession(request);
  if (response) return response;
  const document = await getDocumentReviewStore().getOwned(documentId, sessionId);
  if (!document) {
    return reviewErrorResponse(
      "This review document is unavailable or has expired. Upload it again to continue.",
      "document_unavailable",
      410,
    );
  }
  return NextResponse.json(reviewDocumentResponse(document));
});
