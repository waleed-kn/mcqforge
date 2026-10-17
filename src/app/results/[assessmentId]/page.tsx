import { Suspense } from "react";
import Link from "next/link";
import { cookies } from "next/headers";
import { reviewSessionCookieName } from "@/application/config/document-review";
import { getReviewOwnerFromCookie } from "@/application/services/review-session";
import { getAssessmentStore } from "@/infrastructure/storage/assessment-store";
import { AssessmentResults } from "@/components/assessment/assessment-results";
import { assessmentResultSchema } from "@/validation/assessment";

type ResultsPageProps = {
  params: Promise<{ assessmentId: string }>;
};

async function ResultsContent({ params }: ResultsPageProps) {
  const { assessmentId } = await params;
  const cookieStore = await cookies();
  const ownerId = getReviewOwnerFromCookie(
    cookieStore.get(reviewSessionCookieName)?.value,
  );
  const assessment = ownerId
    ? await getAssessmentStore().getOwned(assessmentId, ownerId)
    : null;

  if (!assessment || assessment.status !== "submitted" || !assessment.result) {
    return (
      <main className="site-shell review-loading">
        <p className="eyebrow">RESULTS / UNAVAILABLE</p>
        <h1>Results are not available.</h1>
        <p className="handoff-message">
          This test may have expired, belongs to another session, or has not been submitted.
        </p>
        <Link className="back-link" href="/">Start with a document</Link>
      </main>
    );
  }

  const result = assessmentResultSchema.safeParse(assessment.result);
  if (!result.success) {
    return (
      <main className="site-shell review-loading">
        <p className="eyebrow">RESULTS / ERROR</p>
        <h1>Your result could not be verified.</h1>
        <p className="handoff-message">
          The saved assessment data is inconsistent. No score is being displayed.
        </p>
        <Link className="back-link" href="/">Start with a document</Link>
      </main>
    );
  }

  return <AssessmentResults result={result.data} />;
}

export default function ResultsPage({ params }: ResultsPageProps) {
  return (
    <Suspense fallback={<main className="site-shell"><p role="status">Loading your results…</p></main>}>
      <ResultsContent params={params} />
    </Suspense>
  );
}
