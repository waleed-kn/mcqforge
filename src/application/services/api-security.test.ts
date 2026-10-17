import { describe, expect, it } from "vitest";
import { withStorageErrorHandling } from "./api-security";
import { StorageUnavailableError } from "@/infrastructure/storage/storage-error";

describe("storage API error handling", () => {
  it("returns a safe 503 when temporary storage is unavailable", async () => {
    const handler = withStorageErrorHandling(async () => {
      throw new StorageUnavailableError();
    });
    const response = await handler();
    const body = await response.json();

    expect(response.status).toBe(503);
    expect(JSON.stringify(body)).not.toContain("private Redis detail");
    expect(body.error.code).toBe("temporary_storage_unavailable");
  });
});
