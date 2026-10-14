# MCQForge

**Practice smarter. Test yourself. Know your score.**

MCQForge is a document-based MCQ practice and assessment platform designed to turn multiple-choice questions from existing study materials into interactive tests. Upload a supported document, review the extracted questions, configure your assessment, and receive an automatically calculated result with detailed answer review.

Built with a focus on software reliability, performance, accessibility, and a distinctive brutalist editorial interface.

> **Development status:** The App Router foundation, document validation, PDF/DOCX/TXT text extraction, conservative MCQ detection, and upload processing summary are implemented. Review editing, assessments, Redis-backed temporary sessions, and results are not implemented yet.

## Overview

Students often study from MCQs stored in PDFs, Word documents, and plain-text files. Practicing from these documents manually makes it difficult to track answers, manage time, and calculate results.

MCQForge aims to make that workflow interactive, repeatable, and easy to use without requiring an account.

### Core workflow

1. Upload a PDF, DOCX, or TXT document containing MCQs.
2. Extract and validate the questions, options, and answer keys.
3. Review and correct extraction errors.
4. Choose the number of questions for the assessment.
5. Select timed or untimed mode.
6. Complete the test and submit manually or automatically when the timer expires.
7. View the score, percentage, answer breakdown, and correct answers.
8. Start another test without registering an account.

## Features

Implemented in this phase:

- **Document ingestion:** Server-side PDF, DOCX, and UTF-8 TXT validation and text extraction.
- **Question extraction:** Recognize common numbered question boundaries, A–D option labels, inline answer lines, and separate answer-key references.
- **Extraction validation:** Mark questions needing review for missing/duplicate options, missing or invalid keys, multiple answers, or ambiguous numbering/boundaries.
- **Upload feedback:** Display processing errors and detected, valid, and review-required question counts.

Still planned for Version 1:

- **Question review:** Edit, validate, or remove extracted questions before testing.
- **Randomized assessments:** Select questions without replacement, with a maximum of 100 questions per test.
- **Flexible timing:** Choose timed or untimed mode; select a permitted duration before starting a timed test.
- **Answer navigation:** Move between questions and update answers before submission.
- **Automatic submission:** Enforce the deadline on the server for timed assessments.
- **Automatic scoring:** Calculate correct, incorrect, and unanswered counts.
- **Detailed results:** Display the final score, percentage, and question-by-question answer review.
- **Anonymous usage:** No registration or login required.
- **Temporary data:** Store session and assessment state temporarily with a defined expiration policy.
- **Brutalist interface:** High-contrast colors, bold typography, hard edges, and responsive layouts.
- **Testing and CI:** Automated checks for core logic, API behavior, and important user workflows.

### Version 1 limitations

- Scanned PDFs requiring OCR are not supported unless OCR is added in a later version.
- The initial question model supports four options (A–D) and one correct answer per question.
- Extraction quality depends on the structure and readability of the uploaded document.
- Extraction is intentionally conservative and favors numbered questions with clearly labeled option lines. Unnumbered or heavily laid-out questions may be reported as unrecognized or need manual review.
- The upload endpoint returns extracted answers only as part of the pre-test review response. There is not yet an assessment flow that isolates answer keys from a test-taking client.
- Uploads are handled in memory by the route handler and are not persisted. The default maximum file size is 4 MiB; processing also limits PDFs to 300 pages, extracted text to 1,000,000 characters, and expanded DOCX content to 20 MiB.
- AI-generated questions, AI explanations, permanent test history, and user accounts are outside the initial scope.

## Tech stack

| Layer | Technology |
|---|---|
| Application framework | Next.js App Router |
| UI | React and TypeScript |
| Styling | Tailwind CSS |
| Runtime validation | Zod |
| PDF extraction | `pdfjs-dist` |
| DOCX extraction | Mammoth |
| Plain-text extraction | Native JavaScript |
| Temporary storage | Upstash Redis |
| Unit testing | Vitest |
| Browser testing | Playwright |
| Continuous integration | GitHub Actions |
| Deployment | Vercel or a compatible host |

The application uses Next.js Route Handlers for its backend API, with parsing, assessment, scoring, validation, and session management separated into focused modules.

## Architecture

```text
Browser
  |
  v
Next.js App Router
  |
  +-- Upload and document API
  |      |
  |      +-- PDF / DOCX / TXT parsers
  |      +-- Question extraction
  |      +-- Validation and correction
  |
  +-- Assessment API
  |      |
  |      +-- Test configuration
  |      +-- Random question selection
  |      +-- Answer updates
  |      +-- Timer and submission rules
  |      +-- Server-side scoring
  |
  +-- Temporary storage adapter
         |
         +-- Anonymous sessions
         +-- Questions and test state
         +-- Temporary results
```

The server validates and parses documents. Once assessment APIs are implemented, correct answers must remain server-side until a test is finalized; the current parse response is used only in the pre-test review stage.

## Scoring rules

MCQForge uses a straightforward scoring model:

- Correct answer: 1 point.
- Incorrect answer: 0 points.
- Unanswered question: 0 points.
- Negative marking: none.

The percentage is calculated as:

`Percentage = (Correct Answers / Total Questions) × 100`

For example, 42 correct answers out of 50 questions produces a score of 84%.

Unanswered questions remain part of the total-question denominator.

## Design philosophy

MCQForge uses a brutalist editorial visual direction.

- Warm off-white backgrounds
- Near-black typography
- Acid-lime accents
- Strong borders and sharp corners
- Clear visual hierarchy and large question numbers
- Responsive layouts and keyboard-accessible controls
- Restrained animation and purposeful whitespace

The interface prioritizes clarity and usability over decorative effects. It avoids generic dashboard patterns, excessive shadows, glassmorphism, and gradient-heavy styling.

## Getting started

### Prerequisites

- Node.js 20.16+ or 22.3+ (required by the selected PDF.js release)
- npm or the package manager used by the repository
- Git

### Installation

Clone the repository:

```bash
git clone https://github.com/YOUR_USERNAME/mcqforge.git
cd mcqforge
```

Install dependencies:

```bash
npm install
```

Start the development server:

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

### Available scripts

The current project scripts are:

```bash
npm run dev
npm run lint
npm run typecheck
npm test
npm run build
```

Playwright tests may require additional browser installation and configuration. Consult the repository's testing instructions before running them.

## Configuration

Document-processing configuration is server-side and optional for local development:

```dotenv
MAX_DOCUMENT_UPLOAD_BYTES=4194304
```

The value must be an integer from 1,024 bytes through 52,428,800 bytes (50 MiB). If unset, the endpoint defaults to 4 MiB. Keep the value within the hosting platform's request-body limit. For example, Vercel Functions currently have a 4.5 MB request/response payload limit; multipart overhead counts toward that cap, and a platform may reject a request before the route can return its own error. Larger configured uploads may therefore require a host with a higher body limit or direct-to-storage uploads in a later phase.

No Redis credentials are required for the current parser or local UI. Temporary session storage is not implemented yet. When that phase is added, its server-only configuration may include:

```dotenv
UPSTASH_REDIS_REST_URL=
UPSTASH_REDIS_REST_TOKEN=
```

These Redis values are not read by the current code. Never put real credentials in source code or public environment variables.

The current PDF parser uses the `pdfjs-dist/legacy/build/pdf.mjs` Node entry point (not its browser viewer or worker bundle). It has been exercised in the Node server runtime used for the production build. It extracts selectable text only; image-only/scanned PDFs fail with an explicit OCR-not-supported message.

The application should fail clearly when required production storage configuration is missing. It must not silently pretend that in-memory storage provides reliable persistence across serverless requests.

## Reliability and security

The project is designed around the following engineering principles:

- Validate uploaded files and API payloads on the server.
- Enforce configurable upload and processing limits.
- Never execute uploaded document content.
- Treat extracted content as untrusted input.
- Keep answer keys server-side during active assessments.
- Calculate scores on the server.
- Enforce timer deadlines independently of the browser countdown.
- Prevent unauthorized access to another anonymous session's data.
- Make final submission idempotent.
- Expire temporary data according to a documented policy.
- Avoid logging uploaded document contents, answer keys, or session secrets.
- Test parsing failures, invalid inputs, timeouts, and duplicate submissions.

Temporary expiration is not a promise of immediate physical erasure from every infrastructure backup or provider log. Retention claims should match the actual hosting and storage configuration.

## Testing strategy

The current tests exercise:

- Text normalization and question/option/answer-key boundary helpers
- Missing and duplicate options, missing/invalid answer keys, multiple answers, and ambiguous boundaries
- Real minimal PDF.js, Mammoth DOCX, and UTF-8 TXT parsing, including textless/corrupt inputs
- Upload endpoint success and actionable validation errors

Later assessment/session tests should cover:

- Parsing of valid and malformed PDF, DOCX, and TXT files
- Question and answer-key validation
- Random selection without replacement
- Test configuration boundaries
- Answer persistence and question navigation
- Manual and timeout submission
- Scoring and percentage calculations
- Duplicate submission and concurrent updates
- Session isolation and expiration
- Invalid and oversized uploads
- End-to-end test completion and result review

Automated tests and production builds should pass before a release is considered ready.

## Project structure

The implementation is organized around responsibilities. The current structure includes:

```text
src/
├── app/
│   ├── api/documents/parse/
│   ├── globals.css
│   └── page.tsx
├── application/
│   ├── config/
│   └── services/
├── components/
│   ├── ui/
│   └── upload/
├── domain/
├── infrastructure/document-parsers/
└── validation/
```

## Roadmap

- [x] Project foundation and brutalist design system
- [x] PDF, DOCX, and TXT parsing
- [ ] Question validation and correction
- [ ] Test configuration and random selection
- [ ] Assessment interface and timer
- [ ] Server-side scoring and results review
- [ ] Temporary sessions and security hardening
- [ ] Unit, integration, and end-to-end tests
- [ ] CI pipeline and deployment verification

Update this checklist as features are implemented and verified.

## Contributing

Contributions are welcome. For meaningful changes:

1. Open an issue describing the problem or proposed improvement.
2. Keep changes focused and consistent with the existing architecture.
3. Add or update tests for changed behavior.
4. Run the available lint, type-check, test, and build commands.
5. Document new configuration variables and known limitations.

## License

Choose and add a license before presenting the project as open source. Until a license file is included, do not assume others have permission to reuse, modify, or distribute the code.

---

**MCQForge — Turn your MCQ documents into interactive practice.**