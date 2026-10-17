import { z } from "zod";

const optionIdSchema = z.enum(["A", "B", "C", "D"]);

const issueSchema = z.object({
  code: z.enum([
    "missing_prompt",
    "missing_option",
    "duplicate_option_label",
    "unsupported_option_label",
    "missing_answer_key",
    "invalid_answer_key",
    "multiple_correct_answers",
    "ambiguous_question_number",
    "ambiguous_question_boundary",
  ]),
  message: z.string().max(2_000),
}).strict();

const questionSchema = z.object({
  id: z.string().uuid(),
  sourceNumber: z.string().max(255).nullable(),
  sourcePageNumbers: z.array(z.number().int().positive()).max(300),
  prompt: z.string().max(20_000),
  options: z.object({
    A: z.string().max(10_000),
    B: z.string().max(10_000),
    C: z.string().max(10_000),
    D: z.string().max(10_000),
  }).strict(),
  correctOption: optionIdSchema.nullable(),
  sourceText: z.string().max(20_000),
  issues: z.array(issueSchema).max(20),
  status: z.enum(["valid", "needs_review"]),
}).strict();

const warningSchema = z.object({
  code: z.enum([
    "unrecognized_content",
    "invalid_answer_reference",
    "parser_warning",
    "no_questions",
  ]),
  message: z.string().max(2_000),
}).strict();

export const storedReviewDocumentSchema = z.object({
  metadata: z.object({
    id: z.string().uuid(),
    fileName: z.string().min(1).max(255),
    mediaType: z.string().max(255),
    extension: z.enum(["pdf", "docx", "txt"]),
    sizeBytes: z.number().int().nonnegative(),
  }).strict(),
  questions: z.array(questionSchema).max(1_000),
  warnings: z.array(warningSchema).max(500),
  revision: z.number().int().nonnegative(),
  confirmed: z.boolean(),
  expiresAt: z.number().int(),
}).strict();

const resultQuestionSchema = z.object({
  questionId: z.string().uuid(),
  sourceNumber: z.string().max(255).nullable(),
  sourcePageNumbers: z.array(z.number().int().positive()).max(300),
  prompt: z.string().max(20_000),
  options: z.object({
    A: z.string().max(10_000),
    B: z.string().max(10_000),
    C: z.string().max(10_000),
    D: z.string().max(10_000),
  }).strict(),
  userAnswer: optionIdSchema.nullable(),
  correctAnswer: optionIdSchema,
  outcome: z.enum(["correct", "incorrect", "unanswered"]),
}).strict();

const storedResultSchema = z.object({
  assessmentId: z.string().uuid(),
  totalQuestions: z.number().int().positive().max(100),
  correct: z.number().int().nonnegative(),
  incorrect: z.number().int().nonnegative(),
  unanswered: z.number().int().nonnegative(),
  percentage: z.number().min(0).max(100),
  roundingPolicy: z.literal("nearest_integer"),
  timedOut: z.boolean(),
  submittedAt: z.number().int(),
  questions: z.array(resultQuestionSchema).min(1).max(100),
}).strict();

export const storedAssessmentRecordSchema = z.object({
  id: z.string().uuid(),
  ownerId: z.string().uuid(),
  documentId: z.string().uuid(),
  requestId: z.string().uuid(),
  configuration: z.object({
    questionCount: z.number().int().min(1).max(100),
    mode: z.enum(["timed", "untimed"]),
    durationMinutes: z.number().int().optional(),
  }).strict(),
  questions: z.array(z.object({
    id: z.string().uuid(),
    sourceNumber: z.string().max(255).nullable(),
    sourcePageNumbers: z.array(z.number().int().positive()).max(300),
    prompt: z.string().max(20_000),
    options: z.object({
      A: z.string().max(10_000),
      B: z.string().max(10_000),
      C: z.string().max(10_000),
      D: z.string().max(10_000),
    }).strict(),
    correctOption: optionIdSchema,
  }).strict()).min(1).max(100),
  answers: z.record(z.string().uuid(), optionIdSchema),
  revision: z.number().int().nonnegative(),
  lastMutationId: z.string().uuid().nullable(),
  status: z.enum(["in_progress", "submitted"]),
  createdAt: z.number().int(),
  startedAt: z.number().int(),
  deadline: z.number().int().nullable(),
  submittedAt: z.number().int().nullable(),
  result: storedResultSchema.nullable(),
  expiresAt: z.number().int(),
}).strict();

export const sessionSchema = z.object({
  id: z.string().uuid(),
  createdAt: z.number().int(),
  lastSeenAt: z.number().int(),
  expiresAt: z.number().int(),
  hardExpiresAt: z.number().int(),
}).strict().superRefine((session, context) => {
  if (
    session.createdAt > session.lastSeenAt ||
    session.expiresAt > session.hardExpiresAt ||
    session.hardExpiresAt <= session.createdAt
  ) {
    context.addIssue({
      code: "custom",
      message: "Temporary session timestamps are inconsistent.",
    });
  }
});
