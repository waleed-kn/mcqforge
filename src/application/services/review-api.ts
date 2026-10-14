import { NextResponse } from "next/server";
import { getReviewSummary, type ReviewDocument } from "@/domain/review-document";

export function reviewDocumentResponse(document: ReviewDocument) {
  return {
    ...document,
    summary: getReviewSummary(document.questions),
  };
}

export function reviewErrorResponse(
  message: string,
  code: string,
  status: number,
) {
  return NextResponse.json({ error: { code, message } }, { status });
}

export function reviewMutationResponse(
  document: ReviewDocument,
  idempotent = false,
) {
  return NextResponse.json({
    document: reviewDocumentResponse(document),
    ...(idempotent ? { idempotent: true } : {}),
  });
}
