import Link from "next/link";
import { DocumentUpload } from "@/components/upload/document-upload";
import { ProgressIndicator } from "@/components/ui/progress-indicator";
import { SectionHeading } from "@/components/ui/section-heading";
import { StatusLabel } from "@/components/ui/status-label";

import { ThemeToggle } from "@/components/ui/theme-toggle";

export default function Home() {
  return (
    <main className="site-shell">
      <header className="masthead">
        <Link className="wordmark" href="/" aria-label="MCQForge home">
          <span className="wordmark-mark" aria-hidden="true">M</span>
          <span>MCQ<span className="wordmark-light">FORGE</span></span>
        </Link>
        <div className="masthead-note">
          <span className="masthead-dot" aria-hidden="true" />
          <span>Practice, built from your notes</span>
        </div>
        <div className="masthead-actions">
          <ThemeToggle />
          <StatusLabel>NO ACCOUNT NEEDED</StatusLabel>
        </div>
      </header>

      <section className="hero" aria-labelledby="hero-title">
        <div className="hero-copy">
          <p className="eyebrow"><span>01</span> YOUR STUDY MATERIAL, REWORKED</p>
          <h1 id="hero-title">
            Turn your notes
            <br />
            into <span className="highlight">practice.</span>
          </h1>
          <p className="hero-description">
            Build a focused multiple-choice test from a document. Review the
            questions, set your pace, and see what you know.
          </p>
          <ProgressIndicator
            steps={["Add a document", "Review questions", "Take your test"]}
            currentStep={0}
          />
        </div>

        <aside className="upload-column" aria-label="Add a study document">
          <div className="upload-label">
            <span>START HERE</span>
            <span className="upload-index">01 / 03</span>
          </div>
          <DocumentUpload />
        </aside>
      </section>

      <section className="workflow" aria-labelledby="workflow-title">
        <SectionHeading
          eyebrow="A CLEAR ROUTE FROM FILE TO FINISH"
          title="Your session, in three steps."
          id="workflow-title"
        />
        <ol className="workflow-list">
          <li>
            <span className="workflow-number">01</span>
            <div>
              <h3>Bring your material</h3>
              <p>Choose a PDF, DOCX, or plain-text study document.</p>
            </div>
            <span className="workflow-mark" aria-hidden="true">↗</span>
          </li>
          <li>
            <span className="workflow-number">02</span>
            <div>
              <h3>Check every question</h3>
              <p>Review and correct the extracted questions before you begin.</p>
            </div>
            <span className="workflow-mark" aria-hidden="true">↗</span>
          </li>
          <li>
            <span className="workflow-number">03</span>
            <div>
              <h3>Practice with purpose</h3>
              <p>Choose your pace, take the test, and learn from your result.</p>
            </div>
            <span className="workflow-mark" aria-hidden="true">↗</span>
          </li>
        </ol>
      </section>

      <footer className="site-footer">
        <span>MCQFORGE / STUDY ON YOUR TERMS</span>
        <span>DOCUMENT EXTRACTION / PDF · DOCX · TXT</span>
      </footer>
    </main>
  );
}
