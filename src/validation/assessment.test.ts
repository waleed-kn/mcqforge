import { describe, expect, it } from "vitest";
import { assessmentConfigurationSchema } from "./assessment";

const validRequest = {
  documentId: "64643e5f-44d7-4ec8-9db4-bb90e0d01a5f",
  requestId: "49d252b1-e427-4919-9a74-9a840ec89950",
  questionCount: 1,
  mode: "untimed",
} as const;

describe("assessmentConfigurationSchema", () => {
  it("accepts question count boundaries and untimed tests without duration", () => {
    expect(assessmentConfigurationSchema.safeParse(validRequest).success).toBe(true);
    expect(
      assessmentConfigurationSchema.safeParse({
        ...validRequest,
        questionCount: 100,
      }).success,
    ).toBe(true);
  });

  it("rejects invalid counts and invalid timed or untimed duration fields", () => {
    for (const questionCount of [0, 101, 1.5]) {
      expect(
        assessmentConfigurationSchema.safeParse({ ...validRequest, questionCount })
          .success,
      ).toBe(false);
    }
    expect(
      assessmentConfigurationSchema.safeParse({
        ...validRequest,
        mode: "timed",
      }).success,
    ).toBe(false);
    expect(
      assessmentConfigurationSchema.safeParse({
        ...validRequest,
        mode: "timed",
        durationMinutes: 20,
      }).success,
    ).toBe(false);
    expect(
      assessmentConfigurationSchema.safeParse({
        ...validRequest,
        durationMinutes: 15,
      }).success,
    ).toBe(false);
    for (const durationMinutes of [15, 30, 60, 90]) {
      expect(
        assessmentConfigurationSchema.safeParse({
          ...validRequest,
          mode: "timed",
          durationMinutes,
        }).success,
      ).toBe(true);
    }
  });
});
