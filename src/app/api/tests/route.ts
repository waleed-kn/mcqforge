import { randomUUID } from "node:crypto";
import { NextResponse, type NextRequest } from "next/server";
import { assessmentConfigurationSchema } from "@/validation/assessment";
import { getReviewOwnerFromCookie } from "@/application/services/review-session";
import { reviewSessionCookieName } from "@/application/config/document-review";
import { createAssessmentRecord, CreateAssessmentError } from "@/application/services/create-assessment";
import { toActiveAssessment } from "@/domain/assessment";
import { getDocumentReviewStore } from "@/infrastructure/storage/document-review-store";
import { getAssessmentStore } from "@/infrastructure/storage/assessment-store";

function errorResponse(message: string, code: string, status: number) {
  return NextResponse.json({ error: { code, message } }, { status });
}

export async function POST(request: NextRequest) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return errorResponse("The test configuration was not valid JSON.", "invalid_request", 400);
  }

  const parsed = assessmentConfigurationSchema.safeParse(body);
  if (!parsed.success) {
    return errorResponse(
      "Choose a question count from 1 to 100, a valid test mode, and an allowed duration when timed.",
      "invalid_configuration",
      400,
    );
  }

  const ownerId = getReviewOwnerFromCookie(
    request.cookies.get(reviewSessionCookieName)?.value,
  );
  if (!ownerId) {
    return errorResponse("Your review session is unavailable. Upload the document again.", "session_unavailable", 401);
  }

  const { documentId, requestId, questionCount, mode, durationMinutes } = parsed.data;
  const document = await getDocumentReviewStore().getOwned(documentId, ownerId);
  if (!document) {
    return errorResponse("This review document is unavailable or has expired. Upload it again.", "document_unavailable", 410);
  }
  if (!document.confirmed) {
    return errorResponse("Confirm your reviewed questions before starting a test.", "review_not_confirmed", 409);
  }

  const validQuestions = document.questions.filter(
    (question) => question.status === "valid" && question.correctOption !== null,
  );
  if (questionCount > validQuestions.length) {
    return errorResponse(
      `You requested ${questionCount} questions, but only ${validQuestions.length} valid questions are available. Choose a smaller count or upload another document.`,
      "not_enough_questions",
      422,
    );
  }

  try {
    const record = createAssessmentRecord({
      id: randomUUID(),
      ownerId,
      documentId,
      requestId,
      configuration: {
        questionCount,
        mode,
        ...(durationMinutes === undefined ? {} : { durationMinutes }),
      },
      availableQuestions: validQuestions,
    });
    const result = await getAssessmentStore().create(record);
    if (result.status === "conflict") {
      return errorResponse(
        "This start request ID was already used for a different test configuration. Start again.",
        "request_id_conflict",
        409,
      );
    }
    return NextResponse.json(
      {
        assessment: toActiveAssessment(result.assessment),
        ...(result.status === "duplicate" ? { idempotent: true } : {}),
      },
      { status: result.status === "duplicate" ? 200 : 201 },
    );
  } catch (error) {
    if (error instanceof CreateAssessmentError) {
      return errorResponse(error.message, error.code, 422);
    }
    throw error;
  }
}
