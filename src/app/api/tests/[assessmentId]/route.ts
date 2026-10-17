import { NextResponse, type NextRequest } from "next/server";
import { reviewSessionCookieName } from "@/application/config/document-review";
import { getReviewOwnerFromCookie } from "@/application/services/review-session";
import { toActiveAssessment } from "@/domain/assessment";
import { getAssessmentStore } from "@/infrastructure/storage/assessment-store";
import { answerUpdateSchema } from "@/validation/assessment";

type RouteContext = {
  params: Promise<{ assessmentId: string }>;
};

export async function GET(request: NextRequest, context: RouteContext) {
  const { assessmentId } = await context.params;
  const ownerId = getReviewOwnerFromCookie(
    request.cookies.get(reviewSessionCookieName)?.value,
  );
  if (!ownerId) {
    return NextResponse.json(
      { error: { code: "session_unavailable", message: "Your test session is unavailable." } },
      { status: 401 },
    );
  }

  const assessment = await getAssessmentStore().getOwned(assessmentId, ownerId);
  if (!assessment) {
    return NextResponse.json(
      { error: { code: "test_unavailable", message: "This test is unavailable or has expired." } },
      { status: 410 },
    );
  }
  return NextResponse.json({ assessment: toActiveAssessment(assessment) });
}

export async function PATCH(request: NextRequest, context: RouteContext) {
  const { assessmentId } = await context.params;
  const ownerId = getReviewOwnerFromCookie(
    request.cookies.get(reviewSessionCookieName)?.value,
  );
  if (!ownerId) {
    return NextResponse.json(
      { error: { code: "session_unavailable", message: "Your test session is unavailable." } },
      { status: 401 },
    );
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { error: { code: "invalid_request", message: "The answer update was not valid JSON." } },
      { status: 400 },
    );
  }
  const parsed = answerUpdateSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: { code: "invalid_answer", message: "Choose one answer and retry the save." } },
      { status: 400 },
    );
  }

  const result = await getAssessmentStore().updateAnswer(
    assessmentId,
    ownerId,
    parsed.data.questionId,
    parsed.data.answer,
    parsed.data.expectedRevision,
    parsed.data.mutationId,
    Date.now(),
  );
  if (result.status === "not_found") {
    return NextResponse.json(
      { error: { code: "test_unavailable", message: "This test is unavailable or has expired." } },
      { status: 410 },
    );
  }
  if (result.status === "missing") {
    return NextResponse.json(
      { error: { code: "question_unavailable", message: "This question is not part of the test." } },
      { status: 404 },
    );
  }
  if (result.status === "conflict") {
    return NextResponse.json(
      {
        error: {
          code: "revision_conflict",
          message: "The test changed in another request. Your latest server-saved answers were reloaded.",
        },
        assessment: toActiveAssessment(result.assessment),
      },
      { status: 409 },
    );
  }
  if (result.status === "submitted") {
    return NextResponse.json(
      {
        error: {
          code: "test_submitted",
          message: "The deadline has passed or this test has already been submitted. Answers can no longer be changed.",
        },
        assessment: toActiveAssessment(result.assessment),
        summary: result.summary,
      },
      { status: 409 },
    );
  }
  return NextResponse.json({
    assessment: toActiveAssessment(result.assessment),
    idempotent: result.idempotent,
  });
}

export async function POST(request: NextRequest, context: RouteContext) {
  const { assessmentId } = await context.params;
  const ownerId = getReviewOwnerFromCookie(
    request.cookies.get(reviewSessionCookieName)?.value,
  );
  if (!ownerId) {
    return NextResponse.json(
      { error: { code: "session_unavailable", message: "Your test session is unavailable." } },
      { status: 401 },
    );
  }
  const result = await getAssessmentStore().submit(
    assessmentId,
    ownerId,
    Date.now(),
  );
  if (result.status !== "submitted") {
    return NextResponse.json(
      { error: { code: "test_unavailable", message: "This test is unavailable or has expired." } },
      { status: 410 },
    );
  }
  return NextResponse.json(
    {
      assessment: toActiveAssessment(result.assessment),
      result: result.assessment.result,
      summary: result.summary,
      idempotent: result.idempotent,
    },
    { status: result.idempotent ? 200 : 201 },
  );
}
