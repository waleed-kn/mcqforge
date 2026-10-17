import { createHash, randomUUID } from "node:crypto";
import type { NextRequest, NextResponse } from "next/server";
import type { AnonymousSession } from "@/application/ports/session-store";
import { getTemporaryStorageConfig } from "@/application/config/temporary-storage";
import { reviewSessionCookieName } from "@/application/config/document-review";
import { getRateLimitStore, getSessionStore } from "@/infrastructure/storage/session-store";
import { StorageUnavailableError } from "@/infrastructure/storage/storage-error";

const sessionIdPattern =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function getSessionIdFromRequest(request: NextRequest): string | null {
  const id = request.cookies.get(reviewSessionCookieName)?.value;
  return id && sessionIdPattern.test(id) ? id.toLowerCase() : null;
}

export async function getAuthenticatedSession(
  request: NextRequest,
): Promise<AnonymousSession | null> {
  const id = getSessionIdFromRequest(request);
  return id ? getAuthenticatedSessionById(id) : null;
}

export async function getAuthenticatedSessionById(
  id: string | undefined,
): Promise<AnonymousSession | null> {
  return id && sessionIdPattern.test(id)
    ? getSessionStore().getAndTouch(id.toLowerCase(), Date.now())
    : null;
}

export async function createAnonymousSession(now = Date.now()): Promise<AnonymousSession> {
  return getSessionStore().create(randomUUID(), now);
}

export function setSessionCookie(response: NextResponse, sessionId: string) {
  response.cookies.set(reviewSessionCookieName, sessionId, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: getTemporaryStorageConfig().maxLifetimeSeconds,
  });
}

export function isSameOriginMutation(request: NextRequest): boolean {
  const fetchSite = request.headers.get("sec-fetch-site");
  if (fetchSite === "cross-site") return false;

  const origin = request.headers.get("origin");
  if (!origin) return false;
  const configuredOrigin = process.env.APP_ORIGIN;
  if (process.env.NODE_ENV === "production") {
    if (!configuredOrigin) throw new StorageUnavailableError("configuration");
    try {
      if (new URL(configuredOrigin).protocol !== "https:") {
        throw new StorageUnavailableError("configuration");
      }
    } catch (error) {
      if (error instanceof StorageUnavailableError) throw error;
      throw new StorageUnavailableError("configuration");
    }
  }
  try {
    const receivedOrigin = new URL(origin).origin;
    const expectedOrigin = configuredOrigin
      ? new URL(configuredOrigin).origin
      : request.nextUrl.origin;
    return receivedOrigin === expectedOrigin;
  } catch {
    return false;
  }
}

export async function consumeRequestRateLimit(
  request: NextRequest,
  action: "upload" | "test-create",
  sessionId?: string,
): Promise<boolean> {
  const config = getTemporaryStorageConfig();
  const forwardedFor = request.headers.get("x-forwarded-for");
  const clientAddress =
    forwardedFor?.split(",")[0]?.trim() ??
    request.headers.get("x-real-ip") ??
    "unknown-client";
  const identity = sessionId ? `session:${sessionId}` : `address:${clientAddress}`;
  const key = createHash("sha256").update(`${action}:${identity}`).digest("hex");
  const limit =
    action === "upload"
      ? config.uploadLimitPerMinute
      : config.testCreationLimitPerMinute;
  return getRateLimitStore().consume(key, limit, 60);
}
