import { NextResponse, type NextRequest } from "next/server";
import { getAuthenticatedSession } from "@/application/services/review-session";
import { getAssessmentStore } from "@/infrastructure/storage/assessment-store";
import { assessmentResultSchema } from "@/validation/assessment";
import { withStorageErrorHandling } from "@/application/services/api-security";
import { resourceIdSchema } from "@/validation/identifiers";

type RouteContext = {
  params: Promise<{ assessmentId: string }>;
};

export const GET = withStorageErrorHandling(async function GET(request: NextRequest, context: RouteContext) {
  const { assessmentId } = await context.params;
  if (!resourceIdSchema.safeParse(assessmentId).success) {
    return NextResponse.json(
      { error: { code: "invalid_test_id", message: "The test ID is invalid." } },
      { status: 400 },
    );
  }
  const session = await getAuthenticatedSession(request);
  if (!session) {
    return NextResponse.json(
      { error: { code: "session_unavailable", message: "Your test session is unavailable." } },
      { status: 401 },
    );
  }

  const assessment = await getAssessmentStore().getOwned(assessmentId, session.id);
  if (!assessment) {
    return NextResponse.json(
      { error: { code: "test_unavailable", message: "This result is unavailable or has expired." } },
      { status: 410 },
    );
  }
  if (assessment.status !== "submitted" || !assessment.result) {
    return NextResponse.json(
      { error: { code: "result_not_ready", message: "Results are available after the test is submitted." } },
      { status: 409 },
    );
  }
  const result = assessmentResultSchema.safeParse(assessment.result);
  if (!result.success) {
    return NextResponse.json(
      { error: { code: "result_inconsistent", message: "This result could not be verified." } },
      { status: 500 },
    );
  }
  return NextResponse.json({ result: result.data });
});
