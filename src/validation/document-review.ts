import { z } from "zod";

const answerOptionIdSchema = z.enum(["A", "B", "C", "D"]);

export const editableQuestionSchema = z
  .object({
    prompt: z.string().trim().max(20_000),
    options: z
      .object({
        A: z.string().trim().max(10_000),
        B: z.string().trim().max(10_000),
        C: z.string().trim().max(10_000),
        D: z.string().trim().max(10_000),
      })
      .strict(),
    correctOption: answerOptionIdSchema.nullable(),
  })
  .strict();

export const reviewMutationSchema = z
  .object({
    expectedRevision: z.number().int().nonnegative(),
    mutationId: z.string().uuid(),
    question: editableQuestionSchema.optional(),
  })
  .strict();

const questionIssueCodeSchema = z.enum([
  "missing_prompt",
  "missing_option",
  "duplicate_option_label",
  "unsupported_option_label",
  "missing_answer_key",
  "invalid_answer_key",
  "multiple_correct_answers",
  "ambiguous_question_number",
  "ambiguous_question_boundary",
]);

export const reviewQuestionResponseSchema = z.object({
  id: z.string().uuid(),
  sourceNumber: z.string().nullable(),
  sourcePageNumbers: z.array(z.number().int().positive()),
  prompt: z.string(),
  options: z.object({
    A: z.string(),
    B: z.string(),
    C: z.string(),
    D: z.string(),
  }),
  correctOption: answerOptionIdSchema.nullable(),
  sourceText: z.string(),
  issues: z.array(
    z.object({
      code: questionIssueCodeSchema,
      message: z.string(),
    }),
  ),
  status: z.enum(["valid", "needs_review"]),
});

export const reviewDocumentResponseSchema = z.object({
  metadata: z.object({
    id: z.string().uuid(),
    fileName: z.string(),
    mediaType: z.string(),
    extension: z.enum(["pdf", "docx", "txt"]),
    sizeBytes: z.number().int().nonnegative(),
  }),
  questions: z.array(reviewQuestionResponseSchema),
  warnings: z.array(
    z.object({
      code: z.enum([
        "unrecognized_content",
        "invalid_answer_reference",
        "parser_warning",
        "no_questions",
      ]),
      message: z.string(),
    }),
  ),
  revision: z.number().int().nonnegative(),
  confirmed: z.boolean(),
  expiresAt: z.number().int(),
  summary: z.object({
    totalQuestions: z.number().int().nonnegative(),
    validQuestions: z.number().int().nonnegative(),
    questionsRequiringReview: z.number().int().nonnegative(),
  }),
});

export type ReviewDocumentResponse = z.infer<typeof reviewDocumentResponseSchema>;

export const reviewMutationResponseSchema = z.object({
  document: reviewDocumentResponseSchema,
  idempotent: z.boolean().optional(),
});

export const reviewErrorResponseSchema = z.object({
  error: z.object({
    code: z.string(),
    message: z.string(),
  }),
});
