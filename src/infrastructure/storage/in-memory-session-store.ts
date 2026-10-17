import type {
  AnonymousSession,
  RateLimitStore,
  SessionStore,
} from "@/application/ports/session-store";
import { getTemporaryStorageConfig } from "@/application/config/temporary-storage";

export class InMemorySessionStore implements SessionStore, RateLimitStore {
  private readonly sessions = new Map<string, AnonymousSession>();
  private readonly rateCounters = new Map<string, { count: number; resetsAt: number }>();

  async create(id: string, now: number): Promise<AnonymousSession> {
    const config = getTemporaryStorageConfig();
    const session = {
      id,
      createdAt: now,
      lastSeenAt: now,
      expiresAt: Math.min(now + config.idleTtlSeconds * 1_000, now + config.maxLifetimeSeconds * 1_000),
      hardExpiresAt: now + config.maxLifetimeSeconds * 1_000,
    };
    this.sessions.set(id, session);
    return session;
  }

  async getAndTouch(id: string, now: number): Promise<AnonymousSession | null> {
    const session = this.sessions.get(id);
    if (!session || session.expiresAt <= now || session.hardExpiresAt <= now) {
      this.sessions.delete(id);
      return null;
    }
    const config = getTemporaryStorageConfig();
    const touched = {
      ...session,
      lastSeenAt: now,
      expiresAt: Math.min(now + config.idleTtlSeconds * 1_000, session.hardExpiresAt),
    };
    this.sessions.set(id, touched);
    return touched;
  }

  async get(id: string, now: number): Promise<AnonymousSession | null> {
    const session = this.sessions.get(id);
    if (!session || session.expiresAt <= now || session.hardExpiresAt <= now) {
      this.sessions.delete(id);
      return null;
    }
    return session;
  }

  async consume(key: string, limit: number, windowSeconds: number): Promise<boolean> {
    const now = Date.now();
    for (const [storedKey, counter] of this.rateCounters) {
      if (counter.resetsAt <= now) this.rateCounters.delete(storedKey);
    }
    const current = this.rateCounters.get(key);
    if (!current || current.resetsAt <= now) {
      this.rateCounters.set(key, { count: 1, resetsAt: now + windowSeconds * 1_000 });
      return true;
    }
    if (current.count >= limit) return false;
    current.count += 1;
    return true;
  }
}
