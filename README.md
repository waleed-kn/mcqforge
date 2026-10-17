# MCQForge

**Practice smarter. Test yourself. Know your score.**

MCQForge is a document-based MCQ practice and assessment platform designed to turn multiple-choice questions from existing study materials into interactive tests. Upload a supported document, review the extracted questions, configure your assessment, and receive an automatically calculated result with detailed answer review.

Built with a focus on software reliability, performance, accessibility, and a distinctive brutalist editorial interface.

> **Development status:** The App Router foundation, document extraction, question review, test configuration, server-enforced assessment engine, authoritative scoring, protected temporary sessions, and Upstash Redis storage adapters are implemented. Local in-memory mode is explicit and development-only.

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
- **Question review:** Edit, validate, save, cancel, search, filter, and remove extracted questions before testing; only complete questions can proceed.
- **Test configuration:** Select 1–100 available valid questions, choose timed or untimed mode, and select a duration for timed tests.
- **Stable test creation:** Randomly select questions without replacement, record an immutable in-progress snapshot and server timestamps, and keep correct answers out of active-test responses.
- **Assessment engine:** Navigate questions, persist answer updates, enforce server-side deadlines, and finalize tests manually or automatically on timeout.
- **Authoritative scoring and results:** Score saved answers on the server and provide an owner-protected question-by-question review after submission.
- **Anonymous usage:** No registration or login required.
- **Temporary data:** Anonymous session state uses Upstash Redis in production; local development can opt into a process-local adapter.
- **Brutalist interface:** High-contrast colors, bold typography, hard edges, and responsive layouts.
- **Testing:** Automated checks for core logic and API behavior; browser-level end-to-end coverage remains future work.

### Version 1 limitations

- Scanned PDFs requiring OCR are not supported unless OCR is added in a later version.
- The initial question model supports four options (A–D) and one correct answer per question.
- Extraction quality depends on the structure and readability of the uploaded document.
- Extraction is intentionally conservative and favors numbered questions with clearly labeled option lines. Unnumbered or heavily laid-out questions may be reported as unrecognized or need manual review.
- The review endpoint returns extracted answers during the pre-test review stage. Test creation and reload return question snapshots without correct answers. Scores and answer keys are exposed only after an owner-authorized submission.
- Temporary session, document, and assessment records expire after two hours of inactivity and have a 24-hour hard maximum lifetime by default. Redis records are versioned and size-limited. Local `memory` mode is non-durable and disabled in production.
- The default maximum file size is 4 MiB; processing also limits PDFs to 300 pages, extracted text to 1,000,000 characters, expanded DOCX content to 20 MiB, and a review set to 1,000 questions.
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
| Temporary storage | Upstash Redis in production; explicit process-local development adapter |
| Unit testing | Vitest |
| Browser testing | Playwright |
| Continuous integration | GitHub Actions |
| Deployment | Vercel or a compatible host |

The application uses Next.js Route Handlers for its backend API, with parsing, assessment, scoring, validation, and session management separated into focused modules.

Question review is available at `/review/[documentId]`. Its owner-scoped APIs load, save, remove, and confirm questions under `/api/documents/parse/[documentId]`; all edits are validated server-side and saved with optimistic revisions. Confirmed documents lead to test configuration at `/configure/[documentId]`. `POST /api/tests` validates the configuration and creates a server-owned question snapshot; `GET /api/tests/[assessmentId]` reloads that same snapshot and order without correct answers. `/test/[assessmentId]` persists answer changes, supports question navigation and manual submission, and automatically submits timed tests at the server-set deadline.

Allowed timed durations are centralized in `src/application/config/assessment.ts` and currently default to 15, 30, 60, and 90 minutes. Start requests use an owner-scoped request ID for idempotency. Production documents, tests, sessions, and results are stored in shared Upstash Redis and use two-hour inactivity expiration bounded by a 24-hour hard lifetime.

The active test experience persists each selected answer through the owner-scoped `PATCH /api/tests/[assessmentId]` endpoint. `POST /api/tests/[assessmentId]` finalizes an assessment exactly once; timed tests use the server-stored deadline, reject answer changes at or after the deadline, and finalize with answers already saved by the server. The browser countdown is display-only and requests timeout submission. **Answers still pending or offline when the deadline arrives cannot be guaranteed to count**; only server-confirmed saves are included. Repeated submissions return the same server-calculated result. `GET /api/tests/[assessmentId]/result` and `/results/[assessmentId]` require the owning session and do not reveal results for an active test.

Scoring awards one point per correct answer and zero points for incorrect or unanswered questions, with every question included in the denominator. Percentage is rounded to the nearest whole percent using JavaScript `Math.round` (exact half-percent ties round up; for example, 1/3 is 33%). The result is calculated from the server-saved answers and immutable question snapshot; client-supplied scores and answer keys are ignored.

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

The server validates and parses documents, then stores the authoritative review questions behind an owner-scoped review-store interface. Review edits and confirmation are Zod-validated on the server and use optimistic revisions with idempotency keys. The assessment API snapshots the selected questions server-side; correct answers are excluded from active-test DTOs and remain in the temporary server-side snapshot for later scoring.

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

Copy `.env.example` to `.env.local` for local development. It opts into process-local memory explicitly; this data is lost on restart and is not appropriate for production. For shared storage set `MCQFORGE_STORAGE_DRIVER=redis` and configure server-only Upstash credentials:

```dotenv
UPSTASH_REDIS_REST_URL=https://your-database.upstash.io
UPSTASH_REDIS_REST_TOKEN=replace-with-a-server-side-token
APP_ORIGIN=http://localhost:3000
```

In production, `MCQFORGE_STORAGE_DRIVER=redis`, both Redis credentials, and `APP_ORIGIN` are required. Storage is resolved lazily at request time. Missing credentials, invalid configuration, or Redis failures return a controlled service-unavailable response; the application never falls back to in-memory persistence in production. Do not use `NEXT_PUBLIC_` variables for credentials.

The current PDF parser uses the `pdfjs-dist/legacy/build/pdf.mjs` Node entry point (not its browser viewer or worker bundle). It has been exercised in the Node server runtime used for the production build. It extracts selectable text only; image-only/scanned PDFs fail with an explicit OCR-not-supported message.

`SESSION_IDLE_TTL_SECONDS` defaults to 7,200 seconds, `SESSION_MAX_LIFETIME_SECONDS` defaults to 86,400 seconds, `MAX_TEMPORARY_RECORD_BYTES` defaults to 2,097,152 bytes, and upload/test-creation limits default to 5/10 requests per minute. Allowed ranges and validation are enforced in `src/application/config/temporary-storage.ts`. Document and test records are children of a server-side session; every access checks that parent session, and child-key TTL is bounded by the refreshed parent expiry and hard lifetime. Results share the test record's expiration policy.

Mutation routes reject missing, malformed, or cross-site `Origin` headers and reject browser `Sec-Fetch-Site: cross-site` requests. Production deployments must configure the exact public origin in `APP_ORIGIN`. The upload rate limiter uses the proxy-provided client-address header before a session exists; configure the hosting proxy to overwrite/strip client-supplied `X-Forwarded-For`. Requests are rate-limited atomically in Redis. Redis Lua compare-and-set operations serialize question edits, answer changes, test creation, and finalization; a stale concurrent change is rejected rather than silently overwriting newer state.

Rate limits are per session for test creation and per client address (or existing session) for uploads. They are a basic abuse-control boundary, not a substitute for edge-level DDoS controls. Redis TTL is an expiration mechanism, not a guarantee of immediate erasure from provider backups or infrastructure logs. No uploaded original file is stored after extraction; parsed question text is temporary session data.

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
- Validate an active server-side session on every document, test, answer, submission, and result operation.
- Require same-origin mutation requests and apply configurable Redis-backed rate limits to uploads and test creation.
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
- Server-side review edit validation, owner isolation, revision conflicts, repeated-save idempotency, expired reviews, and empty-set removal
- Review edit completeness rules, removal of stale validation issues, and duplicated option text
- Assessment count and duration validation, unavailable-question rejection, random selection without replacement, stable snapshots, start-request idempotency, state transitions, and omission of answer keys from active-test responses
- Assessment answer persistence, owner isolation, optimistic update conflicts, deadline-boundary enforcement, manual and timeout finalization, repeated submission idempotency, and editing after submission
- Authoritative scoring, nearest-integer percentage rounding, result ownership and active-test result blocking, and rejection of client-supplied scores
- Session isolation, inactivity/hard expiration, CSRF origin validation, cookie attributes, rate limits, missing Redis configuration, and controlled Redis failures

Additional assessment/session tests should cover:

- Parsing of valid and malformed PDF, DOCX, and TXT files
- Question and answer-key validation
- Random selection without replacement
- Test configuration boundaries
- Answer persistence and question navigation
- Manual and timeout submission
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
│   ├── api/
│   │   ├── documents/parse/
│   │   └── tests/
│   ├── configure/
│   ├── results/
│   ├── review/
│   ├── test/
│   ├── globals.css
│   └── page.tsx
│   ├── globals.css
│   └── page.tsx
├── application/
│   ├── config/
│   ├── ports/
│   └── services/
├── components/
│   ├── assessment/
│   ├── ui/
│   └── upload/
├── domain/                 # includes assessment scoring and result models
├── infrastructure/
│   ├── document-parsers/
│   └── storage/
└── validation/
```

## Roadmap

- [x] Project foundation and brutalist design system
- [x] PDF, DOCX, and TXT parsing
- [x] Question validation and correction
- [x] Test configuration and random selection
- [x] Stable server-side test snapshots
- [x] Assessment interface and server-enforced timer
- [x] Server-side scoring and results review
- [x] Redis-backed temporary sessions and security hardening
- [x] Unit and API integration coverage for implemented workflows
- [ ] Browser-level end-to-end coverage
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