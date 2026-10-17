import { Suspense } from "react";
import Link from "next/link";
import { redirect } from "next/navigation";
import { cookies } from "next/headers";
import { reviewSessionCookieName } from "@/application/config/document-review";
import { getAuthenticatedSessionById } from "@/application/services/review-session";
import { toActiveAssessment } from "@/domain/assessment";
import { getAssessmentStore } from "@/infrastructure/storage/assessment-store";
import { TestTakingWorkspace } from "@/components/assessment/test-taking-workspace";

type TestPageProps = {
  params: Promise<{ assessmentId: string }>;
};

async function TestContent({ params }: TestPageProps) {
  const { assessmentId } = await params;
  const cookieStore = await cookies();
  let record = null;
  let storageUnavailable = false;
  try {
    const session = await getAuthenticatedSessionById(
      cookieStore.get(reviewSessionCookieName)?.value,
    );
    record = session
      ? await getAssessmentStore().getOwned(assessmentId, session.id)
      : null;
  } catch {
    storageUnavailable = true;
  }

  if (record?.status === "submitted" && record.result) {
    redirect(`/results/${assessmentId}`);
  }

  if (!record) {
    return (
      <main className="site-shell review-loading">
        <p className="eyebrow">TEST / UNAVAILABLE</p>
        <h1>This test is unavailable.</h1>
        <p className="handoff-message">
          {storageUnavailable
            ? "Temporary storage is unavailable. Retry shortly."
            : "The test may have expired or belongs to another session."}
        </p>
        <Link className="back-link" href="/">Start with a document</Link>
      </main>
    );
  }

  return <TestTakingWorkspace initialAssessment={toActiveAssessment(record)} />;
}

export default function TestPage({ params }: TestPageProps) {
  return (
    <Suspense fallback={<main className="site-shell"><p role="status">Loading your test…</p></main>}>
      <TestContent params={params} />
    </Suspense>
  );
}
