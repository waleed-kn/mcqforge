import { Suspense } from "react";
import { cookies } from "next/headers";
import { connection } from "next/server";
import { reviewSessionCookieName } from "@/application/config/document-review";
import { getAuthenticatedSessionById } from "@/application/services/review-session";
import { reviewDocumentResponse } from "@/application/services/review-api";
import { getDocumentReviewStore } from "@/infrastructure/storage/document-review-store";
import { ReviewWorkspace } from "@/components/review/review-workspace";

type ReviewPageProps = {
  params: Promise<{ documentId: string }>;
};

async function ReviewContent({ params }: ReviewPageProps) {
  await connection();
  const { documentId } = await params;
  const cookieStore = await cookies();
  let document = null;
  let initialError =
    "This review document is unavailable or has expired. Upload it again to continue.";
  try {
    const session = await getAuthenticatedSessionById(
      cookieStore.get(reviewSessionCookieName)?.value,
    );
    document = session
      ? await getDocumentReviewStore().getOwned(documentId, session.id)
      : null;
  } catch {
    initialError =
      "Temporary storage is unavailable. Your review could not be loaded; retry shortly.";
  }

  return (
    <ReviewWorkspace
      documentId={documentId}
      initialDocument={document ? reviewDocumentResponse(document) : null}
      initialError={document ? null : initialError}
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
