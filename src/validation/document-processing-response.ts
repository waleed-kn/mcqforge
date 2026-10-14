import { z } from "zod";

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

const answerOptionIdSchema = z.enum(["A", "B", "C", "D"]);

const parsedQuestionSchema = z.object({
  id: z.string().uuid(),
  sourceNumber: z.string().nullable(),
  sourcePageNumbers: z.array(z.number().int().positive()),
  prompt: z.string(),
  options: z.object({
    A: z.string().optional(),
    B: z.string().optional(),
    C: z.string().optional(),
    D: z.string().optional(),
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

export const documentProcessingResponseSchema = z.object({
  status: z.literal("completed"),
  metadata: z.object({
    id: z.string().uuid(),
    fileName: z.string(),
    mediaType: z.string(),
    extension: z.enum(["pdf", "docx", "txt"]),
    sizeBytes: z.number().int().nonnegative(),
  }),
  questions: z.array(parsedQuestionSchema),
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
  totalQuestions: z.number().int().nonnegative(),
  validQuestions: z.number().int().nonnegative(),
  questionsRequiringReview: z.number().int().nonnegative(),
});

export const documentProcessingErrorSchema = z.object({
  error: z.object({
    code: z.string(),
    message: z.string(),
  }),
});
