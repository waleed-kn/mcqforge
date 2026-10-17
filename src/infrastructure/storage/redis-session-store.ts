import type {
  AnonymousSession,
  RateLimitStore,
  SessionStore,
} from "@/application/ports/session-store";
import type { Redis } from "@upstash/redis";
import { getTemporaryStorageConfig } from "@/application/config/temporary-storage";
import { getRedisClient } from "@/infrastructure/storage/redis-client";
import { StorageUnavailableError } from "@/infrastructure/storage/storage-error";
import { sessionSchema } from "@/infrastructure/storage/storage-schemas";

const sessionKey = (id: string) => `mcqforge:v1:session:${id}`;
type RedisSessionCommands = Pick<Redis, "eval" | "get">;

function decodeRedisValue(value: unknown): unknown {
  if (typeof value !== "string") return value;
  try {
    return JSON.parse(value) as unknown;
  } catch {
    return null;
  }
}

const createSessionScript = `
local existing = redis.call("GET", KEYS[1])
if existing then return {existing} end
redis.call("SET", KEYS[1], ARGV[1], "EX", ARGV[2], "NX")
return {redis.call("GET", KEYS[1])}
`;

const touchSessionScript = `
local raw = redis.call("GET", KEYS[1])
if not raw then return {false} end
local session = cjson.decode(raw)
local now = tonumber(ARGV[1])
if tonumber(session.expiresAt) <= now or tonumber(session.hardExpiresAt) <= now then
  redis.call("DEL", KEYS[1])
  return {false}
end
local expiresAt = math.min(now + tonumber(ARGV[2]) * 1000, tonumber(session.hardExpiresAt))
session.lastSeenAt = now
session.expiresAt = expiresAt
local ttl = math.max(1, math.ceil((expiresAt - now) / 1000))
redis.call("SET", KEYS[1], cjson.encode(session), "EX", ttl)
return {cjson.encode(session)}
`;

const consumeRateLimitScript = `
local count = redis.call("INCR", KEYS[1])
if count == 1 then redis.call("EXPIRE", KEYS[1], ARGV[1]) end
return {count <= tonumber(ARGV[2]) and 1 or 0}
`;

export class RedisSessionStore implements SessionStore, RateLimitStore {
  constructor(private readonly client?: RedisSessionCommands) {}

  private redis(): RedisSessionCommands {
    return this.client ?? getRedisClient();
  }

  async create(id: string, now: number): Promise<AnonymousSession> {
    const config = getTemporaryStorageConfig();
    const hardExpiresAt = now + config.maxLifetimeSeconds * 1_000;
    const value: AnonymousSession = {
      id,
      createdAt: now,
      lastSeenAt: now,
      expiresAt: Math.min(now + config.idleTtlSeconds * 1_000, hardExpiresAt),
      hardExpiresAt,
    };
    try {
      const result = await this.redis().eval<
        [string, string],
        [unknown]
      >(
        createSessionScript,
        [sessionKey(id)],
        [JSON.stringify(value), String(config.idleTtlSeconds)],
      );
      const parsed = sessionSchema.safeParse(decodeRedisValue(result[0]));
      if (!parsed.success || parsed.data.id !== id) {
        throw new StorageUnavailableError();
      }
      return parsed.data;
    } catch {
      throw new StorageUnavailableError();
    }
  }

  async getAndTouch(id: string, now: number): Promise<AnonymousSession | null> {
    const config = getTemporaryStorageConfig();
    try {
      const value = await this.redis().eval<
        [string, string],
        [unknown]
      >(
        touchSessionScript,
        [sessionKey(id)],
        [String(now), String(config.idleTtlSeconds)],
      );
      if (!value[0]) return null;
      const parsed = sessionSchema.safeParse(decodeRedisValue(value[0]));
      if (!parsed.success || parsed.data.id !== id) {
        throw new StorageUnavailableError();
      }
      return parsed.data;
    } catch {
      throw new StorageUnavailableError();
    }
  }

  async get(id: string, now: number): Promise<AnonymousSession | null> {
    try {
      const value = await this.redis().get<AnonymousSession>(sessionKey(id));
      const parsed = sessionSchema.safeParse(value);
      if (
        !parsed.success ||
        parsed.data.id !== id ||
        parsed.data.expiresAt <= now ||
        parsed.data.hardExpiresAt <= now
      ) {
        return null;
      }
      return parsed.data;
    } catch {
      throw new StorageUnavailableError();
    }
  }

  async consume(key: string, limit: number, windowSeconds: number): Promise<boolean> {
    try {
      const result = await this.redis().eval<
        [string, string],
        [number]
      >(
        consumeRateLimitScript,
        [`mcqforge:v1:rate:${key}`],
        [String(windowSeconds), String(limit)],
      );
      return result[0] === 1;
    } catch {
      throw new StorageUnavailableError();
    }
  }
}
