"use client";

import type { MultipleChoiceQuestion } from "@/domain/question";
import { answerOptionIds } from "@/domain/question";
import { Button } from "@/components/ui/button";
import { ErrorMessage } from "@/components/ui/error-message";

type QuestionEditorProps = {
  question: MultipleChoiceQuestion;
  dirty: boolean;
  saving: boolean;
  error: string | null;
  onChange: (
    changes: Pick<MultipleChoiceQuestion, "prompt" | "options" | "correctOption">,
  ) => void;
  onSave: () => void;
  onCancel: () => void;
  onRemove: () => void;
};

export function QuestionEditor({
  question,
  dirty,
  saving,
  error,
  onChange,
  onSave,
  onCancel,
  onRemove,
}: QuestionEditorProps) {
  const promptIssues = question.issues.filter(
    (issue) => issue.code === "missing_prompt",
  );
  const missingOptions = question.issues.filter(
    (issue) => issue.code === "missing_option",
  );
  const answerIssues = question.issues.filter(
    (issue) =>
      issue.code === "missing_answer_key" ||
      issue.code === "invalid_answer_key" ||
      issue.code === "multiple_correct_answers",
  );
  const parserWarnings = question.issues.filter(
    (issue) =>
      issue.code === "ambiguous_question_number" ||
      issue.code === "ambiguous_question_boundary",
  );

  function updatePrompt(prompt: string) {
    onChange({
      prompt,
      options: question.options,
      correctOption: question.correctOption,
    });
  }

  function updateOption(optionId: (typeof answerOptionIds)[number], value: string) {
    onChange({
      prompt: question.prompt,
      options: { ...question.options, [optionId]: value },
      correctOption: question.correctOption,
    });
  }

  return (
    <section className="question-editor" aria-labelledby={`editor-${question.id}`}>
      <div className="question-editor-heading">
        <div>
          <p className="editor-eyebrow">
            QUESTION {question.sourceNumber ? `· SOURCE ${question.sourceNumber}` : ""}
            {question.sourcePageNumbers.length > 0
              ? ` · PAGE ${question.sourcePageNumbers.join(", ")}`
              : ""}
          </p>
          <h2 id={`editor-${question.id}`}>Check the question</h2>
        </div>
        <span className={`review-status ${question.status}`}>
          {question.status === "valid" ? "READY" : "NEEDS REVIEW"}
        </span>
      </div>

      {parserWarnings.length > 0 && (
        <div className="parser-warning" role="note">
          <strong>Parser note</strong>
          <ul>
            {parserWarnings.map((issue) => (
              <li key={issue.code}>{issue.message}</li>
            ))}
          </ul>
          <details>
            <summary>View extracted source</summary>
            <pre>{question.sourceText}</pre>
          </details>
        </div>
      )}

      <div className="editor-field">
        <label htmlFor={`prompt-${question.id}`}>Question text</label>
        <textarea
          id={`prompt-${question.id}`}
          rows={4}
          maxLength={20_000}
          disabled={saving}
          value={question.prompt}
          aria-invalid={promptIssues.length > 0}
          aria-describedby={
            promptIssues.length > 0 ? `prompt-error-${question.id}` : undefined
          }
          onChange={(event) => updatePrompt(event.currentTarget.value)}
        />
        {promptIssues.map((issue) => (
          <p className="field-error" id={`prompt-error-${question.id}`} key={issue.code}>
            {issue.message}
          </p>
        ))}
      </div>

      <fieldset className="options-editor">
        <legend>Answer options</legend>
        {answerOptionIds.map((optionId) => {
          const optionIssue = missingOptions.find((issue) =>
            issue.message.includes(`option ${optionId}`),
          );
          return (
            <div className="editor-field option-editor" key={optionId}>
              <label htmlFor={`option-${optionId}-${question.id}`}>
                <span className="option-label">{optionId}</span>
                <span>Option {optionId}</span>
              </label>
              <input
                id={`option-${optionId}-${question.id}`}
                type="text"
                maxLength={10_000}
                disabled={saving}
                value={question.options[optionId]}
                aria-invalid={Boolean(optionIssue)}
                aria-describedby={
                  optionIssue
                    ? `option-error-${optionId}-${question.id}`
                    : undefined
                }
                onChange={(event) =>
                  updateOption(optionId, event.currentTarget.value)
                }
              />
              {optionIssue && (
                <p
                  className="field-error"
                  id={`option-error-${optionId}-${question.id}`}
                >
                  {optionIssue.message}
                </p>
              )}
            </div>
          );
        })}
      </fieldset>

      <fieldset className="correct-answer">
        <legend>Correct answer</legend>
        <div className="answer-choices">
          {answerOptionIds.map((optionId) => (
            <label
              className={`answer-choice${question.correctOption === optionId ? " selected" : ""}`}
              key={optionId}
            >
              <input
                type="radio"
                name={`correct-${question.id}`}
                value={optionId}
                disabled={saving}
                checked={question.correctOption === optionId}
                onChange={() =>
                  onChange({
                    prompt: question.prompt,
                    options: question.options,
                    correctOption: optionId,
                  })
                }
              />
              <span>{optionId}</span>
            </label>
          ))}
        </div>
        {answerIssues.map((issue) => (
          <p className="field-error" key={issue.code}>
            {issue.message}
          </p>
        ))}
      </fieldset>

      {question.status === "needs_review" && (
        <div className="validation-summary" role="status">
          <strong>Not ready for a test</strong>
          <ul>
            {question.issues
              .filter((issue) =>
                [
                  "missing_prompt",
                  "missing_option",
                  "missing_answer_key",
                  "invalid_answer_key",
                  "multiple_correct_answers",
                ].includes(issue.code),
              )
              .map((issue, index) => (
                <li key={`${issue.code}-${index}`}>{issue.message}</li>
              ))}
          </ul>
        </div>
      )}

      {error && <ErrorMessage>{error}</ErrorMessage>}

      <div className="editor-actions">
        <Button
          disabled={!dirty || saving}
          onClick={onSave}
          type="button"
        >
          <span>{saving ? "Saving…" : dirty ? "Save question" : "Saved"}</span>
          <span aria-hidden="true">↗</span>
        </Button>
        <button
          className="secondary-action"
          disabled={!dirty || saving}
          onClick={onCancel}
          type="button"
        >
          Cancel edits
        </button>
        <button
          className="remove-action"
          disabled={saving}
          onClick={onRemove}
          type="button"
        >
          Remove question
        </button>
      </div>
      {dirty && (
        <p className="unsaved-note" role="status">
          Unsaved edits · safe to move to another question; your changes stay here.
        </p>
      )}
    </section>
  );
}
