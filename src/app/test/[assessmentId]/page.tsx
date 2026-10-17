import { Suspense } from "react";
import Link from "next/link";
import { cookies } from "next/headers";
import { reviewSessionCookieName } from "@/application/config/document-review";
import { getReviewOwnerFromCookie } from "@/application/services/review-session";
import { toActiveAssessment } from "@/domain/assessment";
import { getAssessmentStore } from "@/infrastructure/storage/assessment-store";
import { assessmentDurationLabel } from "@/application/services/assessment-presentation";

type TestPageProps = {
  params: Promise<{ assessmentId: string }>;
};

async function TestContent({ params }: TestPageProps) {
  const { assessmentId } = await params;
  const cookieStore = await cookies();
  const ownerId = getReviewOwnerFromCookie(
    cookieStore.get(reviewSessionCookieName)?.value,
  );
  const record = ownerId
    ? await getAssessmentStore().getOwned(assessmentId, ownerId)
    : null;
  const assessment = record ? toActiveAssessment(record) : null;

  return (
    <main className="site-shell configuration-handoff active-test">
      <header className="review-masthead">
        <Link className="wordmark" href="/" aria-label="MCQForge home">
          <span className="wordmark-mark" aria-hidden="true">M</span>
          <span>MCQ<span className="wordmark-light">FORGE</span></span>
        </Link>
        <span className="status-label">{assessment?.status === "in_progress" ? "TEST IN PROGRESS" : "TEST UNAVAILABLE"}</span>
      </header>
      <section aria-labelledby="active-test-title">
        {!assessment ? (
          <>
            <p className="eyebrow"><span>04</span> TEST / UNAVAILABLE</p>
            <h1 id="active-test-title">This test is unavailable.</h1>
            <p className="handoff-message">The test may have expired or belongs to another session.</p>
            <Link className="empty-link" href="/">Start with a document <span>↗</span></Link>
          </>
        ) : (
          <>
            <p className="eyebrow"><span>04</span> TEST / SNAPSHOT READY</p>
            <h1 id="active-test-title">Your test is set.</h1>
            <p className="handoff-message">
              {assessment.configuration.questionCount} questions ·{" "}
              {assessmentDurationLabel(assessment.configuration)} · Started{" "}
              {new Date(assessment.startedAt).toLocaleString()}
            </p>
            {assessment.deadline !== null && (
              <p className="test-deadline">
                SERVER DEADLINE / {new Date(assessment.deadline).toLocaleString()}
              </p>
            )}
            <ol className="active-test-question-list">
              {assessment.questions.map((question, index) => (
                <li key={`${question.id}-${index}`}>
                  <span className="active-test-number">{String(index + 1).padStart(2, "0")}</span>
                  <div>
                    <h2>{question.prompt}</h2>
                    <ul>
                      {(["A", "B", "C", "D"] as const).map((option) => (
                        <li key={option}>
                          <span>{option}</span> {question.options[option]}
                        </li>
                      ))}
                    </ul>
                  </div>
                </li>
              ))}
            </ol>
            <div className="handoff-note">
              <span className="handoff-number">↗</span>
              <div>
                <h2>The full test-taking interface is the next implementation phase.</h2>
                <p>This is the stored question snapshot. Reloading the test preserves this question set and order.</p>
              </div>
            </div>
          </>
        )}
      </section>
    </main>
  );
}

export default function TestPage({ params }: TestPageProps) {
  return (
    <Suspense fallback={<main className="site-shell"><p role="status">Loading your test…</p></main>}>
      <TestContent params={params} />
    </Suspense>
  );
}
