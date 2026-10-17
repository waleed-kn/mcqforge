"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { ActiveAssessment, SubmissionSummary } from "@/domain/assessment";
import { moveAssessmentQuestion } from "@/domain/assessment";
import type { AnswerOptionId } from "@/domain/question";
import { Button } from "@/components/ui/button";
import { ErrorMessage } from "@/components/ui/error-message";
import {
  assessmentResultSchema,
  assessmentErrorResponseSchema,
  assessmentMutationResponseSchema,
} from "@/validation/assessment";

type PendingAnswer = {
  answer: AnswerOptionId;
  mutationId: string;
};

type TestTakingWorkspaceProps = {
  initialAssessment: ActiveAssessment;
};

function unansweredCount(assessment: ActiveAssessment, answers: Record<string, AnswerOptionId>) {
  return assessment.questions.length -
    assessment.questions.filter((question) => answers[question.id] !== undefined).length;
}

function formatRemaining(milliseconds: number) {
  const seconds = Math.ceil(Math.max(0, milliseconds) / 1000);
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const remainingSeconds = seconds % 60;
  return hours > 0
    ? `${hours}:${String(minutes).padStart(2, "0")}:${String(remainingSeconds).padStart(2, "0")}`
    : `${String(minutes).padStart(2, "0")}:${String(remainingSeconds).padStart(2, "0")}`;
}

export function TestTakingWorkspace({
  initialAssessment,
}: TestTakingWorkspaceProps) {
  const router = useRouter();
  const [assessment, setAssessment] = useState(initialAssessment);
  const assessmentRef = useRef(initialAssessment);
  const [answers, setAnswers] = useState(initialAssessment.answers);
  const answersRef = useRef(initialAssessment.answers);
  const pendingAnswers = useRef(new Map<string, PendingAnswer>());
  const draining = useRef(false);
  const drainPromise = useRef<Promise<void> | null>(null);
  const nextTimeoutRetryAt = useRef(0);
  const [saveStates, setSaveStates] = useState<Record<string, "pending" | "saved" | "failed">>({});
  const [activeQuestionIndex, setActiveQuestionIndex] = useState(0);
  const [remainingMs, setRemainingMs] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [submission, setSubmission] = useState<SubmissionSummary | null>(
    initialAssessment.status === "submitted"
      ? {
          answered: Object.keys(initialAssessment.answers).length,
          unanswered: unansweredCount(initialAssessment, initialAssessment.answers),
          submittedAt: initialAssessment.submittedAt ?? initialAssessment.startedAt,
          timedOut:
            initialAssessment.deadline !== null &&
            (initialAssessment.submittedAt ?? 0) >= initialAssessment.deadline,
        }
      : null,
  );
  const [unsavedAtTimeout, setUnsavedAtTimeout] = useState(false);

  const updateAssessment = useCallback((next: ActiveAssessment) => {
    assessmentRef.current = next;
    setAssessment(next);
    answersRef.current = { ...next.answers, ...Object.fromEntries(
      [...pendingAnswers.current].map(([questionId, pending]) => [questionId, pending.answer]),
    ) };
    setAnswers(answersRef.current);
  }, []);

  const acceptSubmission = useCallback(
    (next: ActiveAssessment, summary: SubmissionSummary) => {
      updateAssessment(next);
      pendingAnswers.current.clear();
      setSaveStates({});
      setSubmission(summary);
      setConfirmOpen(false);
      setSubmitting(false);
      router.push(`/results/${next.id}`);
    },
    [router, updateAssessment],
  );

  const drainAnswerQueue = useCallback(async () => {
    if (draining.current) return drainPromise.current;
    draining.current = true;
    drainPromise.current = (async () => {
      while (pendingAnswers.current.size > 0) {
        const [questionId, pending] = pendingAnswers.current.entries().next().value as [
          string,
          PendingAnswer,
        ];
        const current = assessmentRef.current;
        setSaveStates((states) => ({ ...states, [questionId]: "pending" }));
        setError(null);
        try {
          const response = await fetch(`/api/tests/${current.id}`, {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              questionId,
              answer: pending.answer,
              expectedRevision: assessmentRef.current.revision,
              mutationId: pending.mutationId,
            }),
          });
          const body: unknown = await response.json().catch(() => null);
          if (response.status === 409) {
            const parsedError = assessmentErrorResponseSchema.safeParse(body);
            if (parsedError.success && parsedError.data.assessment) {
              const updated = parsedError.data.assessment;
              updateAssessment(updated);
              if (updated.status === "submitted" && parsedError.data.summary) {
                acceptSubmission(updated, parsedError.data.summary);
                setError(parsedError.data.error.message);
                return;
              }
              continue;
            }
          }
          if (!response.ok) {
            const parsedError = assessmentErrorResponseSchema.safeParse(body);
            setError(
              parsedError.success
                ? parsedError.data.error.message
                : "An answer could not be saved. Retry before submitting.",
            );
            setSaveStates((states) => ({ ...states, [questionId]: "failed" }));
            return;
          }
          const result = assessmentMutationResponseSchema.safeParse(body);
          if (!result.success) {
            setError("The server returned an invalid answer save response.");
            setSaveStates((states) => ({ ...states, [questionId]: "failed" }));
            return;
          }
          updateAssessment(result.data.assessment);
          const latest = pendingAnswers.current.get(questionId);
          if (latest?.mutationId === pending.mutationId) {
            pendingAnswers.current.delete(questionId);
            setSaveStates((states) => ({ ...states, [questionId]: "saved" }));
          }
        } catch {
          setError("Could not reach the test service. Your answer is not confirmed saved; retry before submitting.");
          setSaveStates((states) => ({ ...states, [questionId]: "failed" }));
          return;
        }
      }
    })().finally(() => {
      draining.current = false;
      drainPromise.current = null;
    });
    return drainPromise.current;
  }, [acceptSubmission, updateAssessment]);

  function chooseAnswer(questionId: string, answer: AnswerOptionId) {
    if (assessmentRef.current.status !== "in_progress" || submission) return;
    const existing = pendingAnswers.current.get(questionId);
    pendingAnswers.current.set(questionId, {
      answer,
      mutationId: existing?.answer === answer ? existing.mutationId : crypto.randomUUID(),
    });
    const nextAnswers = { ...answersRef.current, [questionId]: answer };
    answersRef.current = nextAnswers;
    setAnswers(nextAnswers);
    setSaveStates((states) => ({ ...states, [questionId]: "pending" }));
    void drainAnswerQueue();
  }

  function retryFailedAnswers() {
    for (const [questionId, pending] of pendingAnswers.current) {
      if (saveStates[questionId] === "failed") {
        setSaveStates((states) => ({ ...states, [questionId]: "pending" }));
        pendingAnswers.current.set(questionId, pending);
      }
    }
    void drainAnswerQueue();
  }

  const submitTest = useCallback(
    async (automatic: boolean) => {
      if (submitting || assessmentRef.current.status === "submitted") return;
      setSubmitting(true);
      setError(null);
      const hadPendingAnswers = pendingAnswers.current.size > 0;
      if (drainPromise.current) await drainPromise.current;
      const timedOutWithUnsentAnswers =
        automatic && (hadPendingAnswers || pendingAnswers.current.size > 0);
      try {
        const response = await fetch(`/api/tests/${assessmentRef.current.id}`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({}),
        });
        const body: unknown = await response.json().catch(() => null);
        if (!response.ok) {
          const parsedError = assessmentErrorResponseSchema.safeParse(body);
          setError(
            parsedError.success
              ? parsedError.data.error.message
              : "The test could not be submitted. Retry when your connection is restored.",
          );
          setSubmitting(false);
          return;
        }
        const result = assessmentMutationResponseSchema.safeParse(body);
        if (!result.success || !result.data.summary || !result.data.result) {
          setError("The server returned an invalid submission response.");
          setSubmitting(false);
          return;
        }
        if (!assessmentResultSchema.safeParse(result.data.result).success) {
          setError("The server returned an invalid final result.");
          setSubmitting(false);
          return;
        }
        acceptSubmission(result.data.assessment, {
          ...result.data.summary,
          timedOut: automatic || result.data.summary.timedOut,
        });
        setUnsavedAtTimeout(timedOutWithUnsentAnswers);
      } catch {
        setError("Could not reach the test service. Submission is not confirmed; retry when online.");
        setSubmitting(false);
      }
    },
    [acceptSubmission, submitting],
  );

  useEffect(() => {
    const deadline = assessment.deadline;
    if (deadline === null || assessment.status !== "in_progress") return;

    function refreshRemaining() {
      if (deadline === null) return;
      const remaining = Math.max(0, deadline - Date.now());
      setRemainingMs(remaining);
      if (remaining === 0 && Date.now() >= nextTimeoutRetryAt.current) {
        nextTimeoutRetryAt.current = Date.now() + 5_000;
        void submitTest(true);
      }
    }
    refreshRemaining();
    const timer = window.setInterval(refreshRemaining, 1000);
    document.addEventListener("visibilitychange", refreshRemaining);
    return () => {
      window.clearInterval(timer);
      document.removeEventListener("visibilitychange", refreshRemaining);
    };
  }, [assessment.deadline, assessment.status, submitTest]);

  useEffect(() => {
    function warnAboutPendingAnswers(event: BeforeUnloadEvent) {
      if (pendingAnswers.current.size === 0) return;
      event.preventDefault();
      event.returnValue = "";
    }
    window.addEventListener("beforeunload", warnAboutPendingAnswers);
    return () => window.removeEventListener("beforeunload", warnAboutPendingAnswers);
  }, []);

  const currentQuestion = assessment.questions[activeQuestionIndex] ?? null;
  const answeredCount = useMemo(
    () => assessment.questions.filter((question) => answers[question.id] !== undefined).length,
    [answers, assessment.questions],
  );
  const hasFailedSave = Object.values(saveStates).some((state) => state === "failed");
  const hasPendingSave = Object.values(saveStates).some((state) => state === "pending");
  const isLocked = assessment.status === "submitted" || submission !== null;

  if (!currentQuestion && !isLocked) {
    return (
      <main className="site-shell review-loading">
        <ErrorMessage>The stored test contains no questions. Return to your documents to start again.</ErrorMessage>
        <Link className="back-link" href="/">Back to document upload</Link>
      </main>
    );
  }

  return (
    <main className="site-shell test-taking-shell">
      <header className="review-masthead">
        <Link className="wordmark" href="/" aria-label="MCQForge home">
          <span className="wordmark-mark" aria-hidden="true">M</span>
          <span>MCQ<span className="wordmark-light">FORGE</span></span>
        </Link>
        <span className="status-label">{isLocked ? "TEST SUBMITTED" : "TEST IN PROGRESS"}</span>
      </header>

      {isLocked ? (
        <section className="test-submitted" aria-labelledby="test-submitted-title">
          <p className="eyebrow"><span>05</span> TEST / SUBMITTED</p>
          <h1 id="test-submitted-title">
            {submission?.timedOut ? "Time is up." : "Test submitted."}
          </h1>
          <p className="handoff-message">
            {submission?.answered ?? answeredCount} answered ·{" "}
            {submission?.unanswered ?? unansweredCount(assessment, answers)} unanswered
          </p>
          {unsavedAtTimeout && (
            <p className="time-warning" role="status">
              Some answers were still pending when time expired. Only answers already confirmed by the server are included.
            </p>
          )}
          <div className="handoff-note">
            <span className="handoff-number">{String(submission?.answered ?? answeredCount).padStart(2, "0")}</span>
            <div>
              <h2>Your answers are finalized.</h2>
              <p>Scoring and the detailed results view are not part of this implementation phase.</p>
            </div>
          </div>
          <Link className="empty-link" href="/">Start with another document <span>↗</span></Link>
        </section>
      ) : (
        <>
          <section className="test-intro" aria-labelledby="test-title">
            <div>
              <p className="eyebrow"><span>04</span> WORK THROUGH YOUR QUESTIONS</p>
              <h1 id="test-title">Stay with the question.</h1>
            </div>
            <div className="test-meta">
              <span>{assessment.questions.length} QUESTIONS</span>
              <strong>{answeredCount} ANSWERED</strong>
              {remainingMs !== null && (
                <span
                  className={`test-countdown${remainingMs <= 60_000 ? " low-time" : ""}`}
                  role="timer"
                  aria-label={`${formatRemaining(remainingMs)} remaining`}
                >
                  {formatRemaining(remainingMs)}
                  <small>REMAINING</small>
                </span>
              )}
            </div>
          </section>

          <div
            className="test-progress"
            role="progressbar"
            aria-label="Answered questions"
            aria-valuemin={0}
            aria-valuemax={assessment.questions.length}
            aria-valuenow={answeredCount}
          >
            <span style={{ width: `${(answeredCount / assessment.questions.length) * 100}%` }} />
          </div>
          {remainingMs !== null && remainingMs <= 60_000 && remainingMs > 0 && (
            <p className="time-warning" role="status">One minute or less remains. Unsent answers may not be included.</p>
          )}
          {error && (
            <div className="test-error">
              <ErrorMessage>{error}</ErrorMessage>
              {hasFailedSave && (
                <button className="secondary-action" onClick={retryFailedAnswers} type="button">
                  Retry unsaved answers
                </button>
              )}
            </div>
          )}

          <div className="test-workspace">
            <nav className="test-question-index" aria-label="Test question navigation">
              <p>QUESTION INDEX</p>
              <div>
                {assessment.questions.map((question, index) => (
                  <button
                    aria-label={`Question ${index + 1}${answers[question.id] ? ", answered" : ", unanswered"}`}
                    aria-current={activeQuestionIndex === index ? "step" : undefined}
                    className={`test-index-item${activeQuestionIndex === index ? " active" : ""}${answers[question.id] ? " answered" : ""}`}
                    key={`${question.id}-${index}`}
                    onClick={() => setActiveQuestionIndex(index)}
                    type="button"
                  >
                    {String(index + 1).padStart(2, "0")}
                  </button>
                ))}
              </div>
              <p className="index-legend">
                <span className="answered-mark" /> Answered
                <span className="unanswered-mark" /> Unanswered
              </p>
            </nav>

            {currentQuestion && (
              <section className="test-question-panel" aria-labelledby={`question-${currentQuestion.id}`}>
                <div className="test-question-heading">
                  <span>QUESTION {String(activeQuestionIndex + 1).padStart(2, "0")} / {String(assessment.questions.length).padStart(2, "0")}</span>
                  <span className={`answer-save-state ${saveStates[currentQuestion.id] ?? (answers[currentQuestion.id] ? "saved" : "")}`}>
                    {saveStates[currentQuestion.id] === "pending"
                      ? "SAVING…"
                      : saveStates[currentQuestion.id] === "failed"
                        ? "SAVE FAILED"
                        : answers[currentQuestion.id]
                          ? "SAVED"
                          : "NOT ANSWERED"}
                  </span>
                </div>
                <h2 id={`question-${currentQuestion.id}`}>{currentQuestion.prompt}</h2>
                <fieldset className="test-options" disabled={isLocked || submitting}>
                  <legend>Select one answer</legend>
                  {(["A", "B", "C", "D"] as const).map((option) => (
                    <label
                      className={`test-option${answers[currentQuestion.id] === option ? " selected" : ""}`}
                      key={option}
                    >
                      <input
                        checked={answers[currentQuestion.id] === option}
                        name={`answer-${currentQuestion.id}`}
                        onChange={() => chooseAnswer(currentQuestion.id, option)}
                        type="radio"
                        value={option}
                      />
                      <span className="test-option-letter">{option}</span>
                      <span>{currentQuestion.options[option]}</span>
                    </label>
                  ))}
                </fieldset>
                <div className="test-navigation">
                  <button
                    className="secondary-action"
                    disabled={activeQuestionIndex === 0}
                    onClick={() => setActiveQuestionIndex((index) =>
                      moveAssessmentQuestion(index, assessment.questions.length, -1),
                    )}
                    type="button"
                  >
                    ← Previous
                  </button>
                  <button
                    className="secondary-action"
                    disabled={activeQuestionIndex === assessment.questions.length - 1}
                    onClick={() => setActiveQuestionIndex((index) =>
                      moveAssessmentQuestion(index, assessment.questions.length, 1),
                    )}
                    type="button"
                  >
                    Next →
                  </button>
                </div>
              </section>
            )}
          </div>

          <footer className="test-submit-bar">
            <p>{answeredCount} answered · {assessment.questions.length - answeredCount} unanswered</p>
            <Button
              disabled={submitting || hasFailedSave || hasPendingSave}
              onClick={() => setConfirmOpen(true)}
              type="button"
            >
              <span>Submit test</span>
              <span aria-hidden="true">→</span>
            </Button>
          </footer>
        </>
      )}

      {confirmOpen && (
        <div className="test-dialog-backdrop">
          <section
            aria-labelledby="submit-confirm-title"
            aria-modal="true"
            className="test-submit-dialog"
            role="dialog"
          >
            <p className="eyebrow">FINAL CHECK</p>
            <h2 id="submit-confirm-title">Submit this test?</h2>
            <p>
              {answeredCount} answered · {assessment.questions.length - answeredCount} unanswered.
              You cannot change answers after submission.
            </p>
            <div className="test-dialog-actions">
              <button className="secondary-action" onClick={() => setConfirmOpen(false)} type="button">
                Keep working
              </button>
              <Button
                disabled={submitting || hasPendingSave || hasFailedSave}
                onClick={() => void submitTest(false)}
                type="button"
              >
                <span>{submitting ? "Submitting…" : "Submit now"}</span>
                <span aria-hidden="true">→</span>
              </Button>
            </div>
          </section>
        </div>
      )}
    </main>
  );
}
