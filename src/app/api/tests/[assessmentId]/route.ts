import { NextResponse, type NextRequest } from "next/server";
import { reviewSessionCookieName } from "@/application/config/document-review";
import { getReviewOwnerFromCookie } from "@/application/services/review-session";
import { toActiveAssessment } from "@/domain/assessment";
import { getAssessmentStore } from "@/infrastructure/storage/assessment-store";

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
