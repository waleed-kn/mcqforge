"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useRef, useState } from "react";
import {
  hasQuestionEdits,
  restoreQuestionDraft,
  updateQuestionDraft,
} from "@/application/services/review-question";
import { Button } from "@/components/ui/button";
import { ErrorMessage } from "@/components/ui/error-message";
import { QuestionEditor } from "@/components/review/question-editor";
import {
  reviewErrorResponseSchema,
  reviewMutationResponseSchema,
  type ReviewDocumentResponse,
} from "@/validation/document-review";
import { getReviewSummary } from "@/domain/review-document";
import type { MultipleChoiceQuestion } from "@/domain/question";

type ReviewQuestion = ReviewDocumentResponse["questions"][number];
type Filter = "all" | "review";

type RequestOutcome =
  | { document: ReviewDocumentResponse; error: null }
  | { document: null; error: string };

function editableFields(question: ReviewQuestion) {
  return {
    prompt: question.prompt,
    options: question.options,
    correctOption: question.correctOption,
  };
}

async function saveQuestionRequest(
  documentId: string,
  question: ReviewQuestion,
  revision: number,
  mutationId = crypto.randomUUID(),
): Promise<RequestOutcome> {
  try {
    const response = await fetch(
      `/api/documents/parse/${documentId}/questions/${question.id}`,
      {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          expectedRevision: revision,
          mutationId,
          question: editableFields(question),
        }),
      },
    );
    const body: unknown = await response.json().catch(() => null);
    if (!response.ok) {
      return {
        document: null,
        error: await readErrorFromBody(body, "The question could not be saved."),
      };
    }
    const result = reviewMutationResponseSchema.safeParse(body);
    if (!result.success) {
      return { document: null, error: "The server returned an invalid save response." };
    }
    return { document: result.data.document, error: null };
  } catch {
    return { document: null, error: "Could not reach the review service. Try again." };
  }
}

async function readErrorFromBody(value: unknown, fallback: string) {
  const parsed = reviewErrorResponseSchema.safeParse(value);
  return parsed.success ? parsed.data.error.message : fallback;
}

type ReviewWorkspaceProps = {
  documentId: string;
  initialDocument: ReviewDocumentResponse | null;
  initialError: string | null;
};

export function ReviewWorkspace({
  documentId,
  initialDocument,
  initialError,
}: ReviewWorkspaceProps) {
  const router = useRouter();
  const [document, setDocument] = useState<ReviewDocumentResponse | null>(
    initialDocument,
  );
  const [draftQuestions, setDraftQuestions] = useState<ReviewQuestion[]>(
    initialDocument?.questions ?? [],
  );
  const [selectedId, setSelectedId] = useState<string | null>(
    initialDocument?.questions[0]?.id ?? null,
  );
  const [filter, setFilter] = useState<Filter>("all");
  const [search, setSearch] = useState("");
  const [saving, setSaving] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [error, setError] = useState<string | null>(initialError);
  const [saveMessage, setSaveMessage] = useState<string | null>(null);
  const pendingMutations = useRef(
    new Map<string, { revision: number; signature: string; mutationId: string }>(),
  );

  const savedById = useMemo(
    () => new Map(document?.questions.map((question) => [question.id, question]) ?? []),
    [document],
  );
  const selectedQuestion =
    draftQuestions.find((question) => question.id === selectedId) ?? null;
  const dirtyQuestionIds = draftQuestions
    .filter((question) => {
      const saved = savedById.get(question.id);
      return saved !== undefined && hasQuestionEdits(question, saved);
    })
    .map((question) => question.id);
  const summary = getReviewSummary(draftQuestions);
  const visibleQuestions = draftQuestions.filter((question, index) => {
    const matchesFilter = filter === "all" || question.status === "needs_review";
    const normalizedSearch = search.trim().toLowerCase();
    const matchesSearch =
      !normalizedSearch ||
      question.prompt.toLowerCase().includes(normalizedSearch) ||
      String(index + 1).includes(normalizedSearch) ||
      question.sourceNumber?.toLowerCase().includes(normalizedSearch);
    return matchesFilter && matchesSearch;
  });

  function handleQuestionChange(
    questionId: string,
    edits: Pick<MultipleChoiceQuestion, "prompt" | "options" | "correctOption">,
  ) {
    setDraftQuestions((current) => updateQuestionDraft(current, questionId, edits));
    setSaveMessage(null);
  }

  function acceptSavedQuestion(
    savedDocument: ReviewDocumentResponse,
    questionId: string,
  ) {
    setDocument(savedDocument);
    const savedQuestion = savedDocument.questions.find(
      (question) => question.id === questionId,
    );
    if (savedQuestion) {
      setDraftQuestions((current) =>
        restoreQuestionDraft(current, savedDocument.questions, questionId),
      );
    }
  }

  async function saveQuestion(question: ReviewQuestion) {
    if (!document || saving) return;
    setSaving(true);
    setError(null);
    setSaveMessage(null);
    const signature = JSON.stringify(editableFields(question));
    const pending = pendingMutations.current.get(question.id);
    const mutationId =
      pending?.revision === document.revision && pending.signature === signature
        ? pending.mutationId
        : crypto.randomUUID();
    pendingMutations.current.set(question.id, {
      revision: document.revision,
      signature,
      mutationId,
    });
    const result = await saveQuestionRequest(
      documentId,
      question,
      document.revision,
      mutationId,
    );
    if (result.document) {
      pendingMutations.current.delete(question.id);
      acceptSavedQuestion(result.document, question.id);
      setSaveMessage("Question saved.");
    } else {
      setError(result.error);
    }
    setSaving(false);
  }

  function cancelQuestion(questionId: string) {
    const savedQuestion = savedById.get(questionId);
    if (!savedQuestion) return;
    setDraftQuestions((current) =>
      restoreQuestionDraft(current, document?.questions ?? [], questionId),
    );
    setSaveMessage("Edits cancelled.");
    setError(null);
  }

  async function removeQuestion(question: ReviewQuestion) {
    if (!document || saving) return;
    const accepted = window.confirm(
      `Remove question ${question.sourceNumber ?? ""}? This cannot be undone.`,
    );
    if (!accepted) return;

    setSaving(true);
    setError(null);
    setSaveMessage(null);
    try {
      const response = await fetch(
        `/api/documents/parse/${documentId}/questions/${question.id}`,
        {
          method: "DELETE",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            expectedRevision: document.revision,
            mutationId: crypto.randomUUID(),
          }),
        },
      );
      const body: unknown = await response.json().catch(() => null);
      if (!response.ok) {
        setError(await readErrorFromBody(body, "The question could not be removed."));
        return;
      }
      const result = reviewMutationResponseSchema.safeParse(body);
      if (!result.success) {
        setError("The server returned an invalid removal response.");
        return;
      }
      setDocument(result.data.document);
      setDraftQuestions((current) =>
        current.filter((candidate) => candidate.id !== question.id),
      );
      setSelectedId((current) => {
        if (current !== question.id) return current;
        return (
          result.data.document.questions[0]?.id ?? null
        );
      });
      setSaveMessage("Question removed.");
    } catch {
      setError("Could not reach the review service. The question was not removed.");
    } finally {
      setSaving(false);
    }
  }

  async function confirmQuestionSet() {
    if (!document || confirming || summary.validQuestions === 0) return;
    setConfirming(true);
    setError(null);
    setSaveMessage(null);

    async function saveInOrder(
      index: number,
      currentDocument: ReviewDocumentResponse,
    ): Promise<RequestOutcome> {
      if (index >= dirtyQuestionIds.length) {
        return { document: currentDocument, error: null };
      }
      const questionId = dirtyQuestionIds[index];
      const question = draftQuestions.find(
        (candidate) => candidate.id === questionId,
      );
      if (!question) return saveInOrder(index + 1, currentDocument);
      const saved = await saveQuestionRequest(
        documentId,
        question,
        currentDocument.revision,
      );
      if (!saved.document) return saved;
      setDocument(saved.document);
      setDraftQuestions((current) =>
        current.map((candidate) =>
          candidate.id === questionId
            ? (saved.document?.questions.find(
                (serverQuestion) => serverQuestion.id === questionId,
              ) ?? candidate)
            : candidate,
        ),
      );
      return saveInOrder(index + 1, saved.document);
    }

    const savedDocument = await saveInOrder(0, document);
    if (!savedDocument.document) {
      setError(savedDocument.error);
      setConfirming(false);
      return;
    }
    const currentDocument = savedDocument.document;

    try {
      const response = await fetch(
        `/api/documents/parse/${documentId}/confirm`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            expectedRevision: currentDocument.revision,
            mutationId: crypto.randomUUID(),
          }),
        },
      );
      const body: unknown = await response.json().catch(() => null);
      if (!response.ok) {
        setError(await readErrorFromBody(body, "The question set could not be confirmed."));
        setConfirming(false);
        return;
      }
      const result = reviewMutationResponseSchema.safeParse(body);
      if (!result.success) {
        setError("The server returned an invalid confirmation response.");
        setConfirming(false);
        return;
      }
      setConfirming(false);
      router.push(`/configure/${documentId}`);
    } catch {
      setError("Could not reach the review service. Your question set was not confirmed.");
      setConfirming(false);
    }
  }

  if (error && !document) {
    return (
      <main className="site-shell review-loading">
        <p className="eyebrow">YOUR QUESTIONS / REVIEW</p>
        <ErrorMessage>{error}</ErrorMessage>
        <Link className="back-link" href="/">Back to document upload</Link>
        <button
          className="secondary-action"
          onClick={() => window.location.reload()}
          type="button"
        >Reload review</button>
      </main>
    );
  }

  if (!document) return null;

  return (
    <main className="site-shell review-shell">
      <header className="review-masthead">
        <Link className="wordmark" href="/" aria-label="MCQForge home">
          <span className="wordmark-mark" aria-hidden="true">M</span>
          <span>MCQ<span className="wordmark-light">FORGE</span></span>
        </Link>
        <Link className="back-link" href="/">← Replace document</Link>
      </header>

      <section className="review-intro" aria-labelledby="review-title">
        <div>
          <p className="eyebrow"><span>02</span> REVIEW BEFORE YOU BEGIN</p>
          <h1 id="review-title">Make every question yours.</h1>
          <p className="review-description">
            Check the wording, options, and answer key. Incomplete questions stay
            out of any future test until they are corrected.
          </p>
        </div>
        <div className="review-document" aria-label="Document details">
          <span className="review-document-label">SOURCE DOCUMENT</span>
          <strong title={document.metadata.fileName}>{document.metadata.fileName}</strong>
          <span>
            {document.metadata.extension.toUpperCase()} ·{" "}
            {new Date(document.expiresAt).toLocaleTimeString([], {
              hour: "numeric",
              minute: "2-digit",
            })}{" "}
            session expiry
          </span>
        </div>
      </section>

      <section className="review-summary" aria-label="Question processing summary">
        <div>
          <span>QUESTIONS</span>
          <strong>{summary.totalQuestions}</strong>
        </div>
        <div>
          <span>VALID</span>
          <strong>{summary.validQuestions}</strong>
        </div>
        <div>
          <span>NEEDS REVIEW</span>
          <strong>{summary.questionsRequiringReview}</strong>
        </div>
        <p>Saved to a temporary review session · changes are checked by the server</p>
      </section>

      {document.warnings.length > 0 && (
        <aside className="document-warnings" aria-label="Document extraction notes">
          <strong>Document notes</strong>
          <ul>
            {document.warnings.map((warning, index) => (
              <li key={`${warning.code}-${index}`}>{warning.message}</li>
            ))}
          </ul>
        </aside>
      )}

      {error && <ErrorMessage>{error}</ErrorMessage>}
      {saveMessage && (
        <p className="review-save-message" role="status">{saveMessage}</p>
      )}

      {draftQuestions.length === 0 ? (
        <section className="review-empty" aria-labelledby="empty-title">
          <p className="eyebrow">NO QUESTIONS TO REVIEW</p>
          <h2 id="empty-title">
            {document.warnings.some((warning) => warning.code === "no_questions")
              ? "No questions were detected."
              : "This question set is empty."}
          </h2>
          <p>
            Try a document with clearly numbered questions and labeled options,
            or start over with another file.
          </p>
          <Link className="empty-link" href="/">Upload another document <span>↗</span></Link>
        </section>
      ) : (
        <>
          <div className="review-tools">
            <div className="review-filters" role="group" aria-label="Filter questions">
              <button
                className={filter === "all" ? "active" : ""}
                onClick={() => setFilter("all")}
                type="button"
              >
                All <span>{summary.totalQuestions}</span>
              </button>
              <button
                className={filter === "review" ? "active" : ""}
                onClick={() => setFilter("review")}
                type="button"
              >
                Needs review <span>{summary.questionsRequiringReview}</span>
              </button>
            </div>
            <label className="review-search-label" htmlFor="question-search">
              Find question
              <input
                id="question-search"
                type="search"
                value={search}
                onChange={(event) => setSearch(event.currentTarget.value)}
                placeholder="Text or number"
              />
            </label>
          </div>

          <div className="review-layout">
            <nav className="question-navigation" aria-label="Question list">
              <div className="question-navigation-heading">
                <span>QUESTION</span>
                <span>STATUS</span>
              </div>
              <ol>
                {visibleQuestions.map((question) => {
                  const index =
                    draftQuestions.findIndex((candidate) => candidate.id === question.id) + 1;
                  return (
                    <li key={question.id}>
                      <button
                        className={`question-nav-item${question.id === selectedId ? " selected" : ""}`}
                        aria-current={question.id === selectedId ? "page" : undefined}
                        onClick={() => setSelectedId(question.id)}
                        type="button"
                      >
                        <span className="question-nav-number">
                          {String(index).padStart(2, "0")}
                        </span>
                        <span className="question-nav-copy">
                          <span>
                            {question.prompt.trim() || "Question text missing"}
                          </span>
                          <span>
                            {question.status === "valid" ? "READY" : "NEEDS REVIEW"}
                            {dirtyQuestionIds.includes(question.id) ? " · UNSAVED" : ""}
                          </span>
                        </span>
                        <span
                          className={`question-nav-mark ${question.status}`}
                          aria-hidden="true"
                        />
                      </button>
                    </li>
                  );
                })}
              </ol>
              {visibleQuestions.length === 0 && (
                <p className="no-filter-results">No questions match this view.</p>
              )}
            </nav>

            <div className="question-editor-column">
              {selectedQuestion ? (
                <QuestionEditor
                  question={selectedQuestion}
                  dirty={dirtyQuestionIds.includes(selectedQuestion.id)}
                  saving={saving || confirming}
                  error={null}
                  onChange={(edits) =>
                    handleQuestionChange(selectedQuestion.id, edits)
                  }
                  onSave={() => void saveQuestion(selectedQuestion)}
                  onCancel={() => cancelQuestion(selectedQuestion.id)}
                  onRemove={() => void removeQuestion(selectedQuestion)}
                />
              ) : (
                <section className="review-empty-filter">
                  <h2>No question selected</h2>
                  <p>Choose a question from the list to edit it.</p>
                </section>
              )}
            </div>
          </div>
        </>
      )}

      {summary.validQuestions === 0 && draftQuestions.length > 0 && (
        <p className="no-valid-warning" role="status">
          There are no valid questions yet. Complete a question or remove
          unwanted questions before continuing.
        </p>
      )}

      <footer className="review-footer">
        <div>
          <span className="review-footer-step">NEXT / CONFIGURATION</span>
          <p>
            {dirtyQuestionIds.length > 0
              ? `${dirtyQuestionIds.length} unsaved question${dirtyQuestionIds.length === 1 ? "" : "s"} will be saved before continuing.`
              : `${summary.validQuestions} valid question${summary.validQuestions === 1 ? "" : "s"} ready to continue.`}
          </p>
        </div>
        <Button
          disabled={summary.validQuestions === 0 || confirming || saving}
          onClick={confirmQuestionSet}
          type="button"
        >
          <span>
            {confirming
              ? "Saving & confirming…"
              : summary.validQuestions === 0
                ? "Add a valid question to continue"
                : "Confirm set & continue"}
          </span>
          <span aria-hidden="true">→</span>
        </Button>
      </footer>
    </main>
  );
}
