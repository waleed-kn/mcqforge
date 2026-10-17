import type { RateLimitStore, SessionStore } from "@/application/ports/session-store";
import { getStorageProvider } from "@/infrastructure/storage/storage-provider";

export function getSessionStore(): SessionStore {
  return getStorageProvider().sessions;
}

export function getRateLimitStore(): RateLimitStore {
  return getStorageProvider().rateLimits;
}
