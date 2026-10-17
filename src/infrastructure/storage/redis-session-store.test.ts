import { describe, expect, it, vi } from "vitest";
import type { Redis } from "@upstash/redis";
import { RedisSessionStore } from "./redis-session-store";
import { getRedisClient } from "./redis-client";
import { StorageUnavailableError } from "./storage-error";

describe("RedisSessionStore failure handling", () => {
  it("returns a controlled error when Redis commands fail", async () => {
    const unavailableClient = {
      eval: async <Arguments extends unknown[], Result>(
        script: string,
        keys: string[],
        args: Arguments,
      ): Promise<Result> => {
        void script;
        void keys;
        void args;
        throw new Error("private transport detail");
      },
      get: async <Value>(key: string): Promise<Value> => {
        void key;
        throw new Error("private transport detail");
      },
    } satisfies Pick<Redis, "eval" | "get">;
    const store = new RedisSessionStore(unavailableClient);

    await expect(store.getAndTouch("3e1d1ff1-c10e-41d0-885a-820cb9390c1b", Date.now()))
      .rejects.toBeInstanceOf(StorageUnavailableError);
    await expect(store.consume("test-key", 1, 60))
      .rejects.toBeInstanceOf(StorageUnavailableError);
  });

  it("fails clearly when server-side Upstash credentials are missing", () => {
    vi.stubEnv("UPSTASH_REDIS_REST_URL", "");
    vi.stubEnv("UPSTASH_REDIS_REST_TOKEN", "");

    try {
      expect(() => getRedisClient()).toThrow(
        StorageUnavailableError,
      );
    } finally {
      vi.unstubAllEnvs();
    }
  });
});
