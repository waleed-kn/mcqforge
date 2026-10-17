import { describe, expect, it } from "vitest";
import { resolveStorageDriver } from "./storage-provider";
import { StorageUnavailableError } from "./storage-error";

describe("storage driver selection", () => {
  it("requires Redis explicitly in production and rejects memory mode", () => {
    expect(() => resolveStorageDriver("production", undefined))
      .toThrow(StorageUnavailableError);
    expect(() => resolveStorageDriver("production", "memory"))
      .toThrow(StorageUnavailableError);
    expect(resolveStorageDriver("production", "redis")).toBe("redis");
  });

  it("uses memory only for tests or explicit non-production opt-in", () => {
    expect(resolveStorageDriver("test", undefined)).toBe("memory");
    expect(resolveStorageDriver("development", "memory")).toBe("memory");
    expect(resolveStorageDriver("development", undefined)).toBe("redis");
    expect(resolveStorageDriver("test", "redis")).toBe("redis");
    expect(() => resolveStorageDriver("development", "unknown"))
      .toThrow(StorageUnavailableError);
  });
});
