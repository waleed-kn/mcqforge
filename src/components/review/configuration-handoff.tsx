"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { reviewDocumentResponseSchema } from "@/validation/document-review";

export function ConfigurationHandoff({ documentId }: { documentId: string }) {
  const router = useRouter();
  const [message, setMessage] = useState("Checking your confirmed question set…");
  const [fileName, setFileName] = useState<string | null>(null);
  const [validQuestions, setValidQuestions] = useState(0);

  useEffect(() => {
    const controller = new AbortController();
    async function load() {
      try {
        const response = await fetch(`/api/documents/parse/${documentId}`, {
          cache: "no-store",
          signal: controller.signal,
        });
        if (!response.ok) {
          setMessage("This review session is unavailable or has expired.");
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
        setMessage("");
      } catch {
        if (!controller.signal.aborted) {
          setMessage("Could not verify the confirmed question set.");
        }
      }
    }
    void load();
    return () => controller.abort();
  }, [documentId, router]);

  return (
    <main className="site-shell configuration-handoff">
      <header className="review-masthead">
        <Link className="wordmark" href="/" aria-label="MCQForge home">
          <span className="wordmark-mark" aria-hidden="true">M</span>
          <span>MCQ<span className="wordmark-light">FORGE</span></span>
        </Link>
        <span className="status-label">REVIEW CONFIRMED</span>
      </header>
      <section aria-labelledby="configuration-title">
        <p className="eyebrow"><span>03</span> NEXT / CONFIGURATION</p>
        <h1 id="configuration-title">Your question set is ready.</h1>
        {message ? (
          <p className="handoff-message" role="status">{message}</p>
        ) : (
          <>
            <p className="handoff-message">
              {validQuestions} valid{" "}
              {validQuestions === 1 ? "question" : "questions"} from{" "}
              <strong>{fileName}</strong>{" "}
              are confirmed and ready for the next step.
            </p>
            <div className="handoff-note">
              <span className="handoff-number">03</span>
              <div>
                <h2>Test configuration is the next implementation phase.</h2>
                <p>
                  Your reviewed questions are held temporarily in this server
                  session. You can return to edit them or start over.
                </p>
              </div>
            </div>
          </>
        )}
        <Link className="empty-link" href={`/review/${documentId}`}>
          Return to question review <span>↗</span>
        </Link>
      </section>
    </main>
  );
}
