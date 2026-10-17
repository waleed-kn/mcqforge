"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { allowedAssessmentDurationsMinutes, assessmentQuestionLimit } from "@/application/config/assessment";
import { activeAssessmentResponseSchema, type AssessmentConfigurationRequest } from "@/validation/assessment";
import {
  reviewDocumentResponseSchema,
  reviewErrorResponseSchema,
} from "@/validation/document-review";
import { Button } from "@/components/ui/button";
import { ErrorMessage } from "@/components/ui/error-message";

type LoadState = "loading" | "ready" | "unavailable";

export function ConfigurationHandoff({ documentId }: { documentId: string }) {
  const router = useRouter();
  const [loadState, setLoadState] = useState<LoadState>("loading");
  const [fileName, setFileName] = useState<string | null>(null);
  const [validQuestions, setValidQuestions] = useState(0);
  const [questionCount, setQuestionCount] = useState("1");
  const [mode, setMode] = useState<"timed" | "untimed">("untimed");
  const [durationMinutes, setDurationMinutes] = useState(
    String(allowedAssessmentDurationsMinutes[0]),
  );
  const [starting, setStarting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const requestId = useRef<string | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    async function load() {
      try {
        const response = await fetch(`/api/documents/parse/${documentId}`, {
          cache: "no-store",
          signal: controller.signal,
        });
        if (!response.ok) {
          setLoadState("unavailable");
          return;
        }
        const body: unknown = await response.json();
        const result = reviewDocumentResponseSchema.safeParse(body);
        if (!result.success || !result.data.confirmed) {
          router.replace(`/review/${documentId}`);
          return;
        }
        setFileName(result.data.metadata.fileName);
        setValidQuestions(result.data.summary.validQuestions);
        setLoadState("ready");
      } catch {
        if (!controller.signal.aborted) setLoadState("unavailable");
      }
    }
    void load();
    return () => controller.abort();
  }, [documentId, router]);

  const parsedQuestionCount = Number(questionCount);
  const selectedDuration = Number(durationMinutes);
  const maxQuestions = Math.min(assessmentQuestionLimit, validQuestions);

  function resetRequestId() {
    requestId.current = null;
    setError(null);
  }

  async function startTest() {
    if (
      starting ||
      loadState !== "ready" ||
      !Number.isInteger(parsedQuestionCount) ||
      parsedQuestionCount < 1 ||
      parsedQuestionCount > maxQuestions
    ) {
      return;
    }
    setStarting(true);
    setError(null);
    requestId.current ??= crypto.randomUUID();
    const configuration: AssessmentConfigurationRequest = {
      documentId,
      requestId: requestId.current,
      questionCount: parsedQuestionCount,
      mode,
      ...(mode === "timed" ? { durationMinutes: selectedDuration } : {}),
    };
    try {
      const response = await fetch("/api/tests", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(configuration),
      });
      const body: unknown = await response.json().catch(() => null);
      if (!response.ok) {
        const parsedError = reviewErrorResponseSchema.safeParse(body);
        setError(
          parsedError.success
            ? parsedError.data.error.message
            : "The test could not be started. Check the configuration and try again.",
        );
        if (response.status === 409 || response.status === 410) {
          requestId.current = null;
        }
        return;
      }
      const result = activeAssessmentResponseSchema.safeParse(body);
      if (!result.success) {
        setError("The server returned an invalid test response. Please try again.");
        return;
      }
      window.location.replace(`/test/${result.data.assessment.id}`);
    } catch {
      setError("Could not reach the test service. Your request is safe to retry.");
    } finally {
      setStarting(false);
    }
  }

  return (
    <main className="site-shell configuration-handoff">
      <header className="review-masthead">
        <Link className="wordmark" href="/" aria-label="MCQForge home">
          <span className="wordmark-mark" aria-hidden="true">M</span>
          <span>MCQ<span className="wordmark-light">FORGE</span></span>
        </Link>
        <span className="status-label">TEST CONFIGURATION</span>
      </header>
      <section aria-labelledby="configuration-title">
        <p className="eyebrow"><span>03</span> SET YOUR PACE / START</p>
        <h1 id="configuration-title">Build your test.</h1>
        {loadState === "loading" ? (
          <p className="handoff-message" role="status">Checking your confirmed question set…</p>
        ) : loadState === "unavailable" ? (
          <>
            <ErrorMessage>This review session is unavailable or has expired. Upload the document again to continue.</ErrorMessage>
            <Link className="empty-link" href="/">Upload another document <span>↗</span></Link>
          </>
        ) : (
          <>
            <p className="handoff-message">
              <strong>{validQuestions}</strong> valid{" "}
              {validQuestions === 1 ? "question" : "questions"} from{" "}
              <strong>{fileName}</strong> are available for your test.
            </p>
            {validQuestions === 0 ? (
              <div className="configuration-empty">
                <h2>No valid questions are available.</h2>
                <p>Return to review to correct questions, or upload another document.</p>
                <Link className="empty-link" href={`/review/${documentId}`}>
                  Return to question review <span>↗</span>
                </Link>
              </div>
            ) : (
              <div className="configuration-layout">
                <form
                  className="configuration-form"
                  onSubmit={(event) => {
                    event.preventDefault();
                    void startTest();
                  }}
                >
                  <div className="configuration-field">
                    <label htmlFor="question-count">Questions in this test</label>
                    <select
                      id="question-count"
                      value={questionCount}
                      disabled={starting}
                      onChange={(event) => {
                        resetRequestId();
                        setQuestionCount(event.currentTarget.value);
                      }}
                    >
                      {Array.from({ length: maxQuestions }, (_, index) => index + 1).map(
                        (count) => (
                          <option key={count} value={count}>{count}</option>
                        ),
                      )}
                    </select>
                    <span className="configuration-hint">
                      Choose 1–{maxQuestions}. Questions are selected randomly without repeats.
                    </span>
                  </div>

                  <fieldset className="configuration-mode">
                    <legend>Test mode</legend>
                    <label className={`mode-option${mode === "untimed" ? " selected" : ""}`}>
                      <input
                        type="radio"
                        name="mode"
                        value="untimed"
                        checked={mode === "untimed"}
                        disabled={starting}
                        onChange={() => {
                          resetRequestId();
                          setMode("untimed");
                        }}
                      />
                      <span>
                        <strong>Untimed</strong>
                        <small>Work at your own pace.</small>
                      </span>
                    </label>
                    <label className={`mode-option${mode === "timed" ? " selected" : ""}`}>
                      <input
                        type="radio"
                        name="mode"
                        value="timed"
                        checked={mode === "timed"}
                        disabled={starting}
                        onChange={() => {
                          resetRequestId();
                          setMode("timed");
                        }}
                      />
                      <span>
                        <strong>Timed</strong>
                        <small>A server-set deadline starts with your test.</small>
                      </span>
                    </label>
                  </fieldset>

                  {mode === "timed" && (
                    <div className="configuration-field">
                      <label htmlFor="duration">Duration</label>
                      <select
                        id="duration"
                        value={durationMinutes}
                        disabled={starting}
                        onChange={(event) => {
                          resetRequestId();
                          setDurationMinutes(event.currentTarget.value);
                        }}
                      >
                        {allowedAssessmentDurationsMinutes.map((duration) => (
                          <option key={duration} value={duration}>
                            {duration} minutes
                          </option>
                        ))}
                      </select>
                    </div>
                  )}

                  <div className="configuration-summary" aria-live="polite">
                    <span>YOUR TEST</span>
                    <strong>
                      {parsedQuestionCount} {parsedQuestionCount === 1 ? "question" : "questions"}
                    </strong>
                    <p>
                      {mode === "timed"
                        ? `${selectedDuration} minutes · deadline enforced by the server`
                        : "Untimed · no countdown"}
                    </p>
                  </div>
                  {error && <ErrorMessage>{error}</ErrorMessage>}
                  <Button
                    disabled={starting || validQuestions === 0}
                    type="submit"
                  >
                    <span>{starting ? "Starting test…" : "Start test"}</span>
                    <span aria-hidden="true">→</span>
                  </Button>
                </form>
                <aside className="configuration-aside">
                  <span className="handoff-number">04</span>
                  <div>
                    <h2>One stable question set.</h2>
                    <p>
                      Your questions are chosen once when the test starts. Returning to this test keeps its original order.
                    </p>
                  </div>
                </aside>
              </div>
            )}
          </>
        )}
        <Link className="empty-link" href={`/review/${documentId}`}>
          Return to question review <span>↗</span>
        </Link>
      </section>
    </main>
  );
}
