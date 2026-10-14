import { NextResponse, type NextRequest } from "next/server";
import { getOrCreateReviewOwner } from "@/application/services/review-session";
import {
  reviewDocumentResponse,
  reviewErrorResponse,
} from "@/application/services/review-api";
import { getDocumentReviewStore } from "@/infrastructure/storage/document-review-store";

type RouteContext = {
  params: Promise<{ documentId: string }>;
};

export async function GET(request: NextRequest, context: RouteContext) {
  const { documentId } = await context.params;
  const { ownerId } = getOrCreateReviewOwner(request);
  const document = await getDocumentReviewStore().getOwned(documentId, ownerId);
  if (!document) {
    return reviewErrorResponse(
      "This review document is unavailable or has expired. Upload it again to continue.",
      "document_unavailable",
      410,
    );
  }
  return NextResponse.json(reviewDocumentResponse(document));
}
