import { randomUUID } from "node:crypto";
import { describe, expect, it } from "vitest";
import { NextRequest, NextResponse } from "next/server";
import { vi } from "vitest";
import {
  consumeRequestRateLimit,
  getAuthenticatedSessionById,
  isSameOriginMutation,
  setSessionCookie,
} from "./review-session";
import { getSessionStore } from "@/infrastructure/storage/session-store";
import { InMemorySessionStore } from "@/infrastructure/storage/in-memory-session-store";

describe("anonymous sessions and request protections", () => {
  it("isolates session IDs and expires inactive sessions", async () => {
    const store = getSessionStore();
    const firstId = randomUUID();
    const secondId = randomUUID();
    const createdAt = Date.now();
    await store.create(firstId, createdAt);
    await store.create(secondId, createdAt);

    expect(await getAuthenticatedSessionById(firstId)).toMatchObject({ id: firstId });
    expect(await store.get(firstId, Date.now())).not.toBeNull();
    expect(await store.get(secondId, Date.now())).toMatchObject({ id: secondId });

    const expiredId = randomUUID();
    await store.create(expiredId, Date.now() - 25 * 60 * 60 * 1_000);
    expect(await getAuthenticatedSessionById(expiredId)).toBeNull();
  });

  it("rejects invalid session identifiers", async () => {
    expect(await getAuthenticatedSessionById("not-a-session")).toBeNull();
  });

  it("caps sliding expiration at the hard session lifetime", async () => {
    vi.stubEnv("SESSION_IDLE_TTL_SECONDS", "60");
    vi.stubEnv("SESSION_MAX_LIFETIME_SECONDS", "3600");
    try {
      const store = new InMemorySessionStore();
      const session = await store.create(randomUUID(), 1_000);
      for (let now = 50_000; now < session.hardExpiresAt - 1_000; now += 50_000) {
        await store.getAndTouch(session.id, now);
      }
      const touched = await store.getAndTouch(
        session.id,
        session.hardExpiresAt - 1_000,
      );
      expect(touched?.expiresAt).toBe(session.hardExpiresAt);
      expect(await store.get(session.id, session.hardExpiresAt)).toBeNull();
    } finally {
      vi.unstubAllEnvs();
    }
  });

  it("checks the exact origin for cookie-authenticated mutations", () => {
    const sameOrigin = new NextRequest("https://example.test/api/tests", {
      method: "POST",
      headers: { origin: "https://example.test" },
    });
    const crossOrigin = new NextRequest("https://example.test/api/tests", {
      method: "POST",
      headers: { origin: "https://attacker.test", "sec-fetch-site": "cross-site" },
    });
    const missingOrigin = new NextRequest("https://example.test/api/tests", {
      method: "POST",
    });

    expect(isSameOriginMutation(sameOrigin)).toBe(true);
    expect(isSameOriginMutation(crossOrigin)).toBe(false);
    expect(isSameOriginMutation(missingOrigin)).toBe(false);
  });

  it("sets an HttpOnly, SameSite cookie with a restricted path", async () => {
    const response = NextResponse.json({});
    setSessionCookie(response, randomUUID());
    const cookie = response.headers.get("set-cookie");
    expect(cookie).toContain("HttpOnly");
    expect(cookie).toContain("SameSite=lax");
    expect(cookie).toContain("Path=/");
    expect(cookie).toContain("Max-Age=86400");
  });

  it("marks the session cookie Secure in production and fails closed without APP_ORIGIN", () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("APP_ORIGIN", "");
    try {
      const response = NextResponse.json({});
      setSessionCookie(response, randomUUID());
      expect(response.headers.get("set-cookie")).toContain("Secure");
      const request = new NextRequest("https://example.test/api/tests", {
        method: "POST",
        headers: { origin: "https://example.test" },
      });
      expect(() => isSameOriginMutation(request)).toThrow();
    } finally {
      vi.unstubAllEnvs();
    }
  });

  it("applies the configured upload rate limit to a stable client key", async () => {
    const address = randomUUID();
    const request = new NextRequest("http://localhost/api/documents/parse", {
      headers: { "x-forwarded-for": address },
    });
    const outcomes = await Promise.all(
      Array.from({ length: 6 }, () => consumeRequestRateLimit(request, "upload")),
    );
    expect(outcomes.filter(Boolean)).toHaveLength(5);
    expect(outcomes.filter((allowed) => !allowed)).toHaveLength(1);
  });
});
