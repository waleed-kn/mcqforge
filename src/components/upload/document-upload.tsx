"use client";

import { useRef, useState, type ChangeEvent } from "react";
import { documentFileNameSchema } from "@/validation/document-upload";
import { Button } from "@/components/ui/button";
import { ErrorMessage } from "@/components/ui/error-message";

type SelectedFile = {
  name: string;
  size: number;
};

function formatFileSize(size: number) {
  if (size < 1024) return `${size} bytes`;
  if (size < 1024 * 1024) return `${Math.round(size / 1024)} KB`;
  return `${(size / (1024 * 1024)).toFixed(1)} MB`;
}

export function DocumentUpload() {
  const inputRef = useRef<HTMLInputElement>(null);
  const [selectedFile, setSelectedFile] = useState<SelectedFile | null>(null);
  const [error, setError] = useState<string | null>(null);

  function handleFileChange(event: ChangeEvent<HTMLInputElement>) {
    const file = event.currentTarget.files?.[0];
    if (!file) return;

    const result = documentFileNameSchema.safeParse(file.name);
    if (!result.success) {
      setSelectedFile(null);
      setError("Choose a PDF, DOCX, or TXT document.");
      event.currentTarget.value = "";
      return;
    }

    setSelectedFile({ name: file.name, size: file.size });
    setError(null);
  }

  function clearSelection() {
    setSelectedFile(null);
    setError(null);
    if (inputRef.current) inputRef.current.value = "";
  }

  return (
    <div className="document-upload">
      <input
        ref={inputRef}
        className="file-picker-input"
        id="study-document"
        type="file"
        accept=".pdf,.docx,.txt"
        aria-describedby={error ? "upload-error" : "upload-help"}
        aria-invalid={error ? true : undefined}
        onChange={handleFileChange}
      />
      <label className="file-picker" htmlFor="study-document">
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

      <Button disabled aria-describedby="upload-action-note">
        <span>{selectedFile ? "Document processing is next" : "Choose a document to begin"}</span>
        <span className="button-arrow" aria-hidden="true">→</span>
      </Button>
      <p className="upload-action-note" id="upload-action-note">
        {selectedFile
          ? "File selection is a preview only. Processing is not available yet; the file has not been uploaded."
          : "PDF, DOCX, or TXT · Processing will be added in the next phase."}
      </p>
      <span className="sr-only" id="upload-help">
        Supported formats are PDF, DOCX, and TXT. Selecting a file does not
        upload or process it.
      </span>
    </div>
  );
}
