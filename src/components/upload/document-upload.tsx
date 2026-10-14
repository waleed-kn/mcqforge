"use client";

import { useRef, useState, type ChangeEvent } from "react";
import { documentFileNameSchema } from "@/validation/document-upload";
import {
  documentProcessingErrorSchema,
  documentProcessingResponseSchema,
} from "@/validation/document-processing-response";
import { Button } from "@/components/ui/button";
import { ErrorMessage } from "@/components/ui/error-message";

type ParseResult = ReturnType<
  typeof documentProcessingResponseSchema.parse
>;

function formatFileSize(size: number) {
  if (size < 1024) return `${size} bytes`;
  if (size < 1024 * 1024) return `${Math.round(size / 1024)} KB`;
  return `${(size / (1024 * 1024)).toFixed(1)} MB`;
}

export function DocumentUpload() {
  const inputRef = useRef<HTMLInputElement>(null);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [parseResult, setParseResult] = useState<ParseResult | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function handleFileChange(event: ChangeEvent<HTMLInputElement>) {
    const file = event.currentTarget.files?.[0];
    if (!file) return;

    const result = documentFileNameSchema.safeParse(file.name);
    if (!result.success) {
      setSelectedFile(null);
      setParseResult(null);
      setError("Choose a PDF, DOCX, or TXT document.");
      event.currentTarget.value = "";
      return;
    }

    setSelectedFile(file);
    setParseResult(null);
    setError(null);
  }

  function clearSelection() {
    setSelectedFile(null);
    setParseResult(null);
    setError(null);
    if (inputRef.current) inputRef.current.value = "";
  }

  async function processSelectedDocument() {
    if (!selectedFile || isProcessing) return;

    setIsProcessing(true);
    setError(null);
    setParseResult(null);
    const formData = new FormData();
    formData.set("file", selectedFile);

    try {
      const response = await fetch("/api/documents/parse", {
        method: "POST",
        body: formData,
      });
      const body: unknown = await response.json().catch(() => null);

      if (!response.ok) {
        const parsedError = documentProcessingErrorSchema.safeParse(body);
        setError(
          parsedError.success
            ? parsedError.data.error.message
            : "The document could not be processed. Try a different file or format.",
        );
        return;
      }

      const parsedResult = documentProcessingResponseSchema.safeParse(body);
      if (!parsedResult.success) {
        setError("The server returned an invalid document processing result.");
        return;
      }
      setParseResult(parsedResult.data);
    } catch {
      setError("Could not reach the document processing service. Please try again.");
    } finally {
      setIsProcessing(false);
    }
  }

  return (
    <div className="document-upload" aria-busy={isProcessing}>
      <input
        ref={inputRef}
        className="file-picker-input"
        id="study-document"
        type="file"
        accept=".pdf,.docx,.txt"
        aria-describedby={error ? "upload-error" : "upload-help"}
        aria-invalid={error ? true : undefined}
        disabled={isProcessing}
        onChange={handleFileChange}
      />
      <label
        className={`file-picker${isProcessing ? " file-picker-disabled" : ""}`}
        htmlFor="study-document"
      >
        <span className="file-picker-icon" aria-hidden="true">+</span>
        <span className="file-picker-title">Choose a study document</span>
        <span className="file-picker-hint">Select a file from this device</span>
      </label>
      <div className="file-types" aria-label="Accepted file formats">
        <span className="file-type">PDF</span>
        <span className="file-type">DOCX</span>
        <span className="file-type">TXT</span>
      </div>

      {selectedFile && (
        <div className="selected-file" aria-live="polite">
          <div className="selected-file-copy">
            <p className="selected-file-name">{selectedFile.name}</p>
            <p className="selected-file-detail">
              {formatFileSize(selectedFile.size)} · selected on this device
            </p>
          </div>
          <button className="text-button" onClick={clearSelection} type="button">
            Remove
          </button>
        </div>
      )}

      {error && <ErrorMessage id="upload-error">{error}</ErrorMessage>}

      <Button
        disabled={!selectedFile || isProcessing}
        aria-describedby="upload-action-note"
        onClick={processSelectedDocument}
      >
        <span>
          {isProcessing
            ? "Parsing document…"
            : selectedFile
              ? "Extract questions"
              : "Choose a document to begin"}
        </span>
        <span className="button-arrow" aria-hidden="true">→</span>
      </Button>
      <p className="upload-action-note" id="upload-action-note">
        {isProcessing
          ? "Reading document text and checking for recognizable questions."
          : "PDF, DOCX, or TXT · Maximum upload size is configured on the server."}
      </p>
      {isProcessing && (
        <p className="processing-status" role="status">
          Processing your document. Larger documents may take a little longer.
        </p>
      )}

      {parseResult && (
        <section
          className="parse-result"
          aria-labelledby="parse-result-title"
          aria-live="polite"
        >
          <div className="parse-result-heading">
            <h2 id="parse-result-title">Extraction complete</h2>
            <span className="parse-result-format">
              {parseResult.metadata.extension.toUpperCase()}
            </span>
          </div>
          <dl className="parse-counts">
            <div>
              <dt>Detected</dt>
              <dd>{parseResult.totalQuestions}</dd>
            </div>
            <div>
              <dt>Valid</dt>
              <dd>{parseResult.validQuestions}</dd>
            </div>
            <div>
              <dt>Review</dt>
              <dd>{parseResult.questionsRequiringReview}</dd>
            </div>
          </dl>
          {parseResult.warnings.length > 0 && (
            <ul className="parse-warnings">
              {parseResult.warnings.map((warning, index) => (
                <li key={`${warning.code}-${index}`}>{warning.message}</li>
              ))}
            </ul>
          )}
          {parseResult.totalQuestions > 0 && (
            <p className="parse-result-note">
              Correct answers were identified for review only. Test-taking is
              not available in this phase.
            </p>
          )}
          <button
            className="text-button parse-reset"
            onClick={clearSelection}
            type="button"
          >
            Parse another document
          </button>
        </section>
      )}

      <span className="sr-only" id="upload-help">
        Supported formats are PDF, DOCX, and TXT. Selecting a file does not
        start processing until you select Extract questions.
      </span>
    </div>
  );
}
