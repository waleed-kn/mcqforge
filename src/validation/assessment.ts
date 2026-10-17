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
    submittedAt: z.number().int().nullable(),
    expiresAt: z.number().int(),
    answers: z.record(z.string().uuid(), z.enum(["A", "B", "C", "D"])),
    revision: z.number().int().nonnegative(),
  })
  .strict();

export const activeAssessmentResponseSchema = z.object({
  assessment: activeAssessmentSchema,
  idempotent: z.boolean().optional(),
});

export const answerUpdateSchema = z
  .object({
    questionId: z.string().uuid(),
    answer: z.enum(["A", "B", "C", "D"]),
    expectedRevision: z.number().int().nonnegative(),
    mutationId: z.string().uuid(),
  })
  .strict();

export const assessmentResultQuestionSchema = z
  .object({
    questionId: z.string().uuid(),
    sourceNumber: z.string().nullable(),
    sourcePageNumbers: z.array(z.number().int().positive()),
    prompt: z.string(),
    options: z.object({
      A: z.string(),
      B: z.string(),
      C: z.string(),
      D: z.string(),
    }),
    userAnswer: z.enum(["A", "B", "C", "D"]).nullable(),
    correctAnswer: z.enum(["A", "B", "C", "D"]),
    outcome: z.enum(["correct", "incorrect", "unanswered"]),
  })
  .strict();

export const assessmentResultSchema = z
  .object({
    assessmentId: z.string().uuid(),
    totalQuestions: z.number().int().positive(),
    correct: z.number().int().nonnegative(),
    incorrect: z.number().int().nonnegative(),
    unanswered: z.number().int().nonnegative(),
    percentage: z.number().min(0).max(100),
    roundingPolicy: z.literal("nearest_integer"),
    timedOut: z.boolean(),
    submittedAt: z.number().int(),
    questions: z.array(assessmentResultQuestionSchema).min(1),
  })
  .strict()
  .superRefine((result, context) => {
    if (
      result.correct + result.incorrect + result.unanswered !==
      result.totalQuestions
    ) {
      context.addIssue({
        code: "custom",
        path: ["totalQuestions"],
        message: "Result totals must equal the total question count.",
      });
    }
    if (result.questions.length !== result.totalQuestions) {
      context.addIssue({
        code: "custom",
        path: ["questions"],
        message: "Result review must include every question.",
      });
    }
    const correct = result.questions.filter((question) => question.outcome === "correct").length;
    const incorrect = result.questions.filter((question) => question.outcome === "incorrect").length;
    const unanswered = result.questions.filter((question) => question.outcome === "unanswered").length;
    const questionIds = new Set<string>();
    if (
      correct !== result.correct ||
      incorrect !== result.incorrect ||
      unanswered !== result.unanswered
    ) {
      context.addIssue({
        code: "custom",
        path: ["questions"],
        message: "Question outcomes must agree with the result totals.",
      });
    }
    for (const [index, question] of result.questions.entries()) {
      const expectedOutcome =
        question.userAnswer === null
          ? "unanswered"
          : question.userAnswer === question.correctAnswer
            ? "correct"
            : "incorrect";
      if (question.outcome !== expectedOutcome || questionIds.has(question.questionId)) {
        context.addIssue({
          code: "custom",
          path: ["questions", index],
          message: "Question outcome and ID must match the finalized answer snapshot.",
        });
      }
      questionIds.add(question.questionId);
    }
    if (
      result.percentage !==
      Math.round((result.correct / result.totalQuestions) * 100)
    ) {
      context.addIssue({
        code: "custom",
        path: ["percentage"],
        message: "Percentage must use nearest-whole-percent rounding.",
      });
    }
  });

export const assessmentMutationResponseSchema = z.object({
  assessment: activeAssessmentSchema,
  result: assessmentResultSchema.optional(),
  idempotent: z.boolean().optional(),
  summary: z.object({
    answered: z.number().int().nonnegative(),
    unanswered: z.number().int().nonnegative(),
    submittedAt: z.number().int(),
    timedOut: z.boolean(),
  }).optional(),
});

export const assessmentErrorResponseSchema = z.object({
  error: z.object({
    code: z.string(),
    message: z.string(),
  }),
  assessment: activeAssessmentSchema.optional(),
  summary: z.object({
    answered: z.number().int().nonnegative(),
    unanswered: z.number().int().nonnegative(),
    submittedAt: z.number().int(),
    timedOut: z.boolean(),
  }).optional(),
});

export const assessmentResultResponseSchema = z.object({
  result: assessmentResultSchema,
});

export type AssessmentConfigurationRequest = z.infer<
  typeof assessmentConfigurationSchema
>;
export type ActiveAssessmentResponse = z.infer<typeof activeAssessmentSchema>;
