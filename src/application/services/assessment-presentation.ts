import type { AssessmentConfiguration } from "@/domain/assessment";

export function assessmentDurationLabel(configuration: AssessmentConfiguration): string {
  return configuration.mode === "timed"
    ? `${configuration.durationMinutes} minutes`
    : "Untimed";
}
