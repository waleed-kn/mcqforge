import { randomUUID } from "node:crypto";
import { describe, expect, it } from "vitest";
import type { AssessmentRecord } from "@/domain/assessment";
import { InMemoryAssessmentStore } from "./in-memory-assessment-store";

function makeAssessment(): AssessmentRecord {
  return {
    id: randomUUID(),
    ownerId: randomUUID(),
    documentId: randomUUID(),
    requestId: randomUUID(),
    configuration: { questionCount: 2, mode: "timed", durationMinutes: 15 },
    questions: [1, 2].map((index) => ({
      id: randomUUID(),
      sourceNumber: String(index),
      sourcePageNumbers: [],
      prompt: `Question ${index}`,
      options: { A: "A", B: "B", C: "C", D: "D" },
      correctOption: "A" as const,
    })),
    status: "in_progress",
    createdAt: 100,
    startedAt: 100,
    deadline: 900_100,
    expiresAt: Date.now() + 60_000,
  };
}

describe("InMemoryAssessmentStore", () => {
  it("keeps the created question snapshot and order stable after reload", async () => {
    const store = new InMemoryAssessmentStore();
    const input = makeAssessment();
    await store.create(input);
    const reloaded = await store.getOwned(input.id, input.ownerId);
    expect(reloaded?.questions.map((question) => question.id)).toEqual(
      input.questions.map((question) => question.id),
    );
  });

  it("deduplicates repeated start requests and rejects request ID reuse for another configuration", async () => {
    const store = new InMemoryAssessmentStore();
    const input = makeAssessment();
    const first = await store.create(input);
    const duplicate = await store.create({ ...input, id: randomUUID() });
    const conflict = await store.create({
      ...input,
      id: randomUUID(),
      configuration: { ...input.configuration, questionCount: 1 },
    });

    expect(first.status).toBe("created");
    expect(duplicate).toMatchObject({
      status: "duplicate",
      assessment: { id: input.id },
    });
    expect(conflict.status).toBe("conflict");
  });

  it("isolates assessment snapshots to the owning session", async () => {
    const store = new InMemoryAssessmentStore();
    const input = makeAssessment();
    await store.create(input);
    expect(await store.getOwned(input.id, randomUUID())).toBeNull();
  });
});
