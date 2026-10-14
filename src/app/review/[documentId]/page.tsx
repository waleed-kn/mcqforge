import { Suspense } from "react";
import { cookies } from "next/headers";
import { reviewSessionCookieName } from "@/application/config/document-review";
import { getReviewOwnerFromCookie } from "@/application/services/review-session";
import { reviewDocumentResponse } from "@/application/services/review-api";
import { getDocumentReviewStore } from "@/infrastructure/storage/document-review-store";
import { ReviewWorkspace } from "@/components/review/review-workspace";

type ReviewPageProps = {
  params: Promise<{ documentId: string }>;
};

async function ReviewContent({ params }: ReviewPageProps) {
  const { documentId } = await params;
  const cookieStore = await cookies();
  const ownerId = getReviewOwnerFromCookie(
    cookieStore.get(reviewSessionCookieName)?.value,
  );
  const document = ownerId
    ? await getDocumentReviewStore().getOwned(documentId, ownerId)
    : null;

  return (
    <ReviewWorkspace
      documentId={documentId}
      initialDocument={document ? reviewDocumentResponse(document) : null}
      initialError={
        document
          ? null
          : "This review document is unavailable or has expired. Upload it again to continue."
      }
    />
  );
}

export default function ReviewPage({ params }: ReviewPageProps) {
  return (
    <Suspense
      fallback={
        <main className="site-shell">
          <p role="status">Loading question review…</p>
        </main>
      }
    >
      <ReviewContent params={params} />
    </Suspense>
  );
}
