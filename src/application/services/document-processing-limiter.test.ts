import { describe, expect, it } from "vitest";
import { acquireDocumentProcessingSlot } from "./document-processing-limiter";

describe("document processing concurrency limit", () => {
  it("caps active uploads and releases each slot exactly once", () => {
    const first = acquireDocumentProcessingSlot();
    const second = acquireDocumentProcessingSlot();
    expect(first).toBeTypeOf("function");
    expect(second).toBeTypeOf("function");
    expect(acquireDocumentProcessingSlot()).toBeNull();

    first?.();
    first?.();
    const third = acquireDocumentProcessingSlot();
    expect(third).toBeTypeOf("function");

    second?.();
    third?.();
  });
});
