import { randomUUID } from "node:crypto";
import { describe, expect, it } from "vitest";
import type { AssessmentRecord } from "@/domain/assessment";
import { InMemoryAssessmentStore } from "./in-memory-assessment-store";

function makeAssessment(overrides: Partial<AssessmentRecord> = {}): AssessmentRecord {
  const startedAt = Date.now();
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
    answers: {},
    revision: 0,
    lastMutationId: null,
    status: "in_progress",
    createdAt: startedAt,
    startedAt,
    deadline: startedAt + 900_000,
    submittedAt: null,
    result: null,
    expiresAt: Date.now() + 60_000,
    ...overrides,
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

  it("persists answer changes and rejects stale concurrent updates", async () => {
    const store = new InMemoryAssessmentStore();
    const input = makeAssessment();
    const questionId = input.questions[0].id;
    await store.create(input);

    const [first, concurrent] = await Promise.all([
      store.updateAnswer(input.id, input.ownerId, questionId, "B", 0, randomUUID(), 200),
      store.updateAnswer(input.id, input.ownerId, questionId, "C", 0, randomUUID(), 201),
    ]);
    expect([first.status, concurrent.status].sort()).toEqual(["conflict", "saved"]);
    const saved = await store.getOwned(input.id, input.ownerId);
    expect(saved?.answers[questionId]).toBeDefined();
    expect(saved?.revision).toBe(1);
  });

  it("uses an exclusive deadline boundary and finalizes using only saved answers", async () => {
    const input = makeAssessment({ deadline: 1_000 });
    const questionId = input.questions[0].id;
    const store = new InMemoryAssessmentStore();
    await store.create(input);

    const onDeadline = await store.updateAnswer(
      input.id,
      input.ownerId,
      questionId,
      "B",
      0,
      randomUUID(),
      1_000,
    );
    expect(onDeadline).toMatchObject({
      status: "submitted",
      summary: { answered: 0, unanswered: 2, timedOut: true },
    });
    const finalRecord = await store.getOwned(input.id, input.ownerId);
    expect(finalRecord?.answers).toEqual({});
    expect(finalRecord?.status).toBe("submitted");
  });

  it("manual submission finalizes exactly once and rejects later answer changes", async () => {
    const input = makeAssessment();
    const questionId = input.questions[0].id;
    const store = new InMemoryAssessmentStore();
    await store.create(input);
    const saved = await store.updateAnswer(
      input.id,
      input.ownerId,
      questionId,
      "D",
      0,
      randomUUID(),
      500,
    );
    expect(saved.status).toBe("saved");

    const [first, repeated] = await Promise.all([
      store.submit(input.id, input.ownerId, 600),
      store.submit(input.id, input.ownerId, 601),
    ]);
    expect(first).toMatchObject({
      status: "submitted",
      summary: { answered: 1, unanswered: 1 },
    });
    expect(repeated).toMatchObject({
      status: "submitted",
      summary: { answered: 1, unanswered: 1 },
    });
    expect([first, repeated].filter(
      (result) => result.status === "submitted" && result.idempotent,
    )).toHaveLength(1);

    const afterSubmit = await store.updateAnswer(
      input.id,
      input.ownerId,
      questionId,
      "A",
      1,
      randomUUID(),
      700,
    );
    expect(afterSubmit.status).toBe("submitted");
    if (afterSubmit.status === "submitted") {
      expect(afterSubmit.assessment.answers[questionId]).toBe("D");
    }
  });

  it("accepts a timed answer immediately before the deadline", async () => {
    const input = makeAssessment({ deadline: 1_000 });
    const questionId = input.questions[0].id;
    const store = new InMemoryAssessmentStore();
    await store.create(input);

    const result = await store.updateAnswer(
      input.id,
      input.ownerId,
      questionId,
      "A",
      0,
      randomUUID(),
      999,
    );
    expect(result.status).toBe("saved");
  });

  it("finalizes an expired timed test when it is next loaded", async () => {
    const input = makeAssessment({
      deadline: Date.now() - 1,
      answers: {},
    });
    const store = new InMemoryAssessmentStore();
    await store.create(input);

    const loaded = await store.getOwned(input.id, input.ownerId);
    expect(loaded).toMatchObject({
      status: "submitted",
      submittedAt: expect.any(Number),
    });
    expect(loaded?.submittedAt).toBeGreaterThanOrEqual(input.deadline ?? 0);
  });
});
