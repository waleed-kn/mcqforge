import { Redis } from "@upstash/redis";
import { z } from "zod";
import { StorageUnavailableError } from "@/infrastructure/storage/storage-error";

let client: Redis | null = null;
const redisUrlSchema = z.string().url().refine(
  (value) => value.startsWith("https://"),
  "Upstash Redis REST URL must use HTTPS.",
);

export function getRedisClient(): Redis {
  if (client) return client;
  const url = process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN;
  const validUrl = redisUrlSchema.safeParse(url);
  if (!validUrl.success || !token?.trim()) {
    throw new StorageUnavailableError("configuration");
  }
  try {
    client = new Redis({ url: validUrl.data, token });
    return client;
  } catch {
    throw new StorageUnavailableError();
  }
}
