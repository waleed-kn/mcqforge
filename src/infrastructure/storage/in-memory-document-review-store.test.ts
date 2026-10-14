import { randomUUID } from "node:crypto";
import { describe, expect, it } from "vitest";
import type { CreateReviewDocumentInput } from "@/application/ports/document-review-store";
import type { MultipleChoiceQuestion } from "@/domain/question";
import { InMemoryDocumentReviewStore } from "./in-memory-document-review-store";

function makeQuestion(prompt: string): MultipleChoiceQuestion {
  return {
    id: randomUUID(),
    sourceNumber: "1",
    sourcePageNumbers: [],
    prompt,
    options: { A: "One", B: "Two", C: "Three", D: "Four" },
    correctOption: "A",
    sourceText: prompt,
    issues: [],
    status: "valid",
  };
}

function makeDocumentInput(
  ownerId = randomUUID(),
  questions = [makeQuestion("Question one")],
): CreateReviewDocumentInput {
  return {
    ownerId,
    metadata: {
      id: randomUUID(),
      fileName: "study.txt",
      mediaType: "text/plain",
      extension: "txt",
      sizeBytes: 100,
    },
    questions,
    warnings: [],
    expiresAt: Date.now() + 60_000,
  };
}

describe("InMemoryDocumentReviewStore", () => {
  it("keeps unsaved client drafts out of storage until an explicit save", async () => {
    const store = new InMemoryDocumentReviewStore();
    const input = makeDocumentInput();
    const created = await store.create(input);
    expect(created.questions[0].prompt).toBe("Question one");

    const edited = {
      prompt: "Question one edited",
      options: input.questions[0].options,
      correctOption: "A" as const,
    };
    const saved = await store.updateQuestion(
      input.metadata.id,
      input.ownerId,
      input.questions[0].id,
      0,
      randomUUID(),
      edited,
    );
    expect(saved.status).toBe("saved");
    if (saved.status === "saved") {
      expect(saved.document.questions[0].prompt).toBe("Question one edited");
      expect(saved.document.revision).toBe(1);
    }
  });

  it("isolates documents by owner and expires temporary reviews", async () => {
    const store = new InMemoryDocumentReviewStore();
    const input = makeDocumentInput();
    await store.create(input);

    expect(
      await store.getOwned(input.metadata.id, randomUUID()),
    ).toBeNull();

    const expired = makeDocumentInput();
    expired.expiresAt = Date.now() - 1;
    await store.create(expired);
    expect(
      await store.getOwned(expired.metadata.id, expired.ownerId),
    ).toBeNull();
  });

  it("makes repeated mutation IDs idempotent and rejects stale revisions", async () => {
    const store = new InMemoryDocumentReviewStore();
    const input = makeDocumentInput();
    await store.create(input);
    const edits = {
      prompt: "Saved once",
      options: input.questions[0].options,
      correctOption: "A" as const,
    };
    const mutationId = randomUUID();

    const first = await store.updateQuestion(
      input.metadata.id,
      input.ownerId,
      input.questions[0].id,
      0,
      mutationId,
      edits,
    );
    const repeated = await store.updateQuestion(
      input.metadata.id,
      input.ownerId,
      input.questions[0].id,
      0,
      mutationId,
      edits,
    );
    expect(first.status).toBe("saved");
    expect(repeated).toMatchObject({ status: "saved", idempotent: true });

    const stale = await store.updateQuestion(
      input.metadata.id,
      input.ownerId,
      input.questions[0].id,
      0,
      randomUUID(),
      edits,
    );
    expect(stale.status).toBe("conflict");
  });

  it("allows removal of every question", async () => {
    const store = new InMemoryDocumentReviewStore();
    const input = makeDocumentInput();
    await store.create(input);
    const removed = await store.removeQuestion(
      input.metadata.id,
      input.ownerId,
      input.questions[0].id,
      0,
      randomUUID(),
    );
    expect(removed.status).toBe("saved");
    if (removed.status === "saved") {
      expect(removed.document.questions).toEqual([]);
    }
  });
});
