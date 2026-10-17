import { z } from "zod";
import { allowedAssessmentDurationsMinutes, assessmentQuestionLimit } from "@/application/config/assessment";

const allowedDurations = new Set<number>(allowedAssessmentDurationsMinutes);

export const assessmentConfigurationSchema = z
  .object({
    documentId: z.string().uuid(),
    requestId: z.string().uuid(),
    questionCount: z.number().int().min(1).max(assessmentQuestionLimit),
    mode: z.enum(["timed", "untimed"]),
    durationMinutes: z.number().int().optional(),
  })
  .strict()
  .superRefine((configuration, context) => {
    if (
      configuration.mode === "timed" &&
      !allowedDurations.has(configuration.durationMinutes ?? Number.NaN)
    ) {
      context.addIssue({
        code: "custom",
        path: ["durationMinutes"],
        message: "Choose an allowed test duration.",
      });
    }
    if (configuration.mode === "untimed" && configuration.durationMinutes !== undefined) {
      context.addIssue({
        code: "custom",
        path: ["durationMinutes"],
        message: "Untimed tests must not include a duration.",
      });
    }
  });

export const activeAssessmentQuestionSchema = z
  .object({
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
  })
  .strict();

export const activeAssessmentSchema = z
  .object({
    id: z.string().uuid(),
    documentId: z.string().uuid(),
    configuration: z.object({
      questionCount: z.number().int().min(1).max(assessmentQuestionLimit),
      mode: z.enum(["timed", "untimed"]),
      durationMinutes: z.number().int().optional(),
    }),
    questions: z.array(activeAssessmentQuestionSchema).min(1),
    status: z.enum(["in_progress", "submitted"]),
    createdAt: z.number().int(),
    startedAt: z.number().int(),
    deadline: z.number().int().nullable(),
    expiresAt: z.number().int(),
  })
  .strict();

export const activeAssessmentResponseSchema = z.object({
  assessment: activeAssessmentSchema,
  idempotent: z.boolean().optional(),
});

export type AssessmentConfigurationRequest = z.infer<
  typeof assessmentConfigurationSchema
>;
export type ActiveAssessmentResponse = z.infer<typeof activeAssessmentSchema>;
