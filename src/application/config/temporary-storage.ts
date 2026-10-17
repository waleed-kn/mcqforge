import { z } from "zod";

const positiveInteger = (fallback: number, minimum: number, maximum: number) =>
  z.coerce.number().int().min(minimum).max(maximum).default(fallback);

const storageConfigSchema = z.object({
  idleTtlSeconds: positiveInteger(2 * 60 * 60, 60, 24 * 60 * 60),
  maxLifetimeSeconds: positiveInteger(24 * 60 * 60, 60 * 60, 7 * 24 * 60 * 60),
  maxRecordBytes: positiveInteger(2 * 1024 * 1024, 64 * 1024, 8 * 1024 * 1024),
  uploadLimitPerMinute: positiveInteger(5, 1, 100),
  testCreationLimitPerMinute: positiveInteger(10, 1, 100),
});

export type TemporaryStorageConfig = {
  idleTtlSeconds: number;
  maxLifetimeSeconds: number;
  maxRecordBytes: number;
  uploadLimitPerMinute: number;
  testCreationLimitPerMinute: number;
};

export class TemporaryStorageConfigurationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "TemporaryStorageConfigurationError";
  }
}

export function getTemporaryStorageConfig(): TemporaryStorageConfig {
  const parsed = storageConfigSchema.safeParse({
    idleTtlSeconds: process.env.SESSION_IDLE_TTL_SECONDS,
    maxLifetimeSeconds: process.env.SESSION_MAX_LIFETIME_SECONDS,
    maxRecordBytes: process.env.MAX_TEMPORARY_RECORD_BYTES,
    uploadLimitPerMinute: process.env.UPLOAD_RATE_LIMIT_PER_MINUTE,
    testCreationLimitPerMinute: process.env.TEST_CREATION_RATE_LIMIT_PER_MINUTE,
  });

  if (!parsed.success) {
    throw new TemporaryStorageConfigurationError(
      "Temporary storage settings must be valid positive integers within the documented limits.",
    );
  }

  if (parsed.data.idleTtlSeconds > parsed.data.maxLifetimeSeconds) {
    throw new TemporaryStorageConfigurationError(
      "SESSION_IDLE_TTL_SECONDS cannot exceed SESSION_MAX_LIFETIME_SECONDS.",
    );
  }

  return parsed.data;
}
