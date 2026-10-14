# MCQForge

**Practice smarter. Test yourself. Know your score.**

MCQForge is a document-based MCQ practice and assessment platform designed to turn multiple-choice questions from existing study materials into interactive tests. Upload a supported document, review the extracted questions, configure your assessment, and receive an automatically calculated result with detailed answer review.

Built with a focus on software reliability, performance, accessibility, and a distinctive brutalist editorial interface.

> **Development status:** In active development. Features are being implemented and verified incrementally. Check the repository's current implementation before relying on any feature in production.

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

The following is the intended Version 1 feature set. Individual features should be marked complete only after their implementation and tests have been verified.

- **Document ingestion:** Support for PDF, DOCX, and TXT files.
- **Question extraction:** Identify question text, four options (A–D), and answer keys.
- **Extraction validation:** Flag malformed or ambiguous questions rather than silently guessing.
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

The server is responsible for authoritative validation, deadlines, submissions, and scoring. Correct answers must not be sent to the browser before the assessment is finalized.

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

- Node.js version compatible with the installed Next.js release
- npm or the package manager used by the repository
- Git
- An Upstash Redis database for the configured persistent temporary-storage implementation

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

Create a local environment file:

```bash
cp .env.example .env.local
```

On Windows PowerShell, if needed:

```powershell
Copy-Item .env.example .env.local
```

Configure the required environment variables using the example file and your own credentials. Never commit `.env.local` or real secrets.

Start the development server:

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

### Available scripts

Use the scripts defined in the project's `package.json`. A typical setup includes:

```bash
npm run dev
npm run lint
npx tsc --noEmit
npx vitest run
npm run build
```

Playwright tests may require additional browser installation and configuration. Consult the repository's testing instructions before running them.

## Configuration

The environment example should document the variables actually used by the implementation.

For the Redis-backed deployment, these commonly include:

```dotenv
UPSTASH_REDIS_REST_URL=
UPSTASH_REDIS_REST_TOKEN=
```

Use placeholders only in `.env.example`. Never put real credentials in source code or public environment variables.

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

The test suite should cover:

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

The repository is organized around responsibilities. The final structure may evolve as the implementation progresses.

```text
src/
├── app/
│   ├── api/
│   ├── upload/
│   ├── review/
│   ├── configure/
│   ├── test/
│   └── results/
├── components/
├── lib/
│   ├── parsers/
│   ├── question-extraction/
│   ├── assessment/
│   ├── sessions/
│   ├── validation/
│   └── storage/
├── types/
└── tests/
    ├── parsing/
    ├── assessment/
    └── api/
```

## Roadmap

- [ ] Project foundation and brutalist design system
- [ ] PDF, DOCX, and TXT parsing
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