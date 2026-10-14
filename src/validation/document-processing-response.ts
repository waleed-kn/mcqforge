import { z } from "zod";

export const documentProcessingResponseSchema = z.object({
  documentId: z.string().uuid(),
  fileName: z.string(),
  revision: z.number().int().nonnegative(),
  summary: z.object({
    totalQuestions: z.number().int().nonnegative(),
    validQuestions: z.number().int().nonnegative(),
    questionsRequiringReview: z.number().int().nonnegative(),
  }),
});

export const documentProcessingErrorSchema = z.object({
  error: z.object({
    code: z.string(),
    message: z.string(),
  }),
});
