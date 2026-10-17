import type {
  AssessmentRecord,
  AssessmentResult,
  AssessmentResultQuestion,
} from "@/domain/assessment";
import { answerOptionIds } from "@/domain/question";

export class AssessmentScoringError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "AssessmentScoringError";
  }
}

export function scoreAssessment(
  assessment: AssessmentRecord,
  timedOut = false,
): AssessmentResult {
  const questions = assessment.questions;
  if (
    questions.length === 0 ||
    assessment.configuration.questionCount !== questions.length
  ) {
    throw new AssessmentScoringError(
      "The assessment snapshot does not match its configured question count.",
    );
  }

  const questionIds = new Set<string>();
  for (const question of questions) {
    if (
      !question.id ||
      questionIds.has(question.id) ||
      !answerOptionIds.includes(question.correctOption)
    ) {
      throw new AssessmentScoringError(
        "The assessment snapshot contains duplicate IDs or an invalid answer key.",
      );
    }
    questionIds.add(question.id);
  }
  for (const [questionId, answer] of Object.entries(assessment.answers)) {
    if (
      !questionIds.has(questionId) ||
      !answerOptionIds.includes(answer)
    ) {
      throw new AssessmentScoringError(
        "The saved answers do not match the assessment question snapshot.",
      );
    }
  }

  let correct = 0;
  let incorrect = 0;
  let unanswered = 0;
  const reviewQuestions: AssessmentResultQuestion[] = questions.map((question) => {
    const userAnswer = assessment.answers[question.id] ?? null;
    const outcome: AssessmentResultQuestion["outcome"] =
      userAnswer === null
        ? "unanswered"
        : userAnswer === question.correctOption
          ? "correct"
          : "incorrect";
    if (outcome === "correct") correct += 1;
    else if (outcome === "incorrect") incorrect += 1;
    else unanswered += 1;

    return {
      questionId: question.id,
      sourceNumber: question.sourceNumber,
      sourcePageNumbers: [...question.sourcePageNumbers],
      prompt: question.prompt,
      options: { ...question.options },
      userAnswer,
      correctAnswer: question.correctOption,
      outcome,
    };
  });

  if (correct + incorrect + unanswered !== questions.length) {
    throw new AssessmentScoringError("Assessment result totals do not match the question count.");
  }

  return {
    assessmentId: assessment.id,
    totalQuestions: questions.length,
    correct,
    incorrect,
    unanswered,
    percentage: Math.round((correct / questions.length) * 100),
    roundingPolicy: "nearest_integer",
    timedOut,
    submittedAt: assessment.submittedAt ?? assessment.startedAt,
    questions: reviewQuestions,
  };
}
