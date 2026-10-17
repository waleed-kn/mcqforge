import type { AssessmentStore } from "@/application/ports/assessment-store";
import type { DocumentReviewStore } from "@/application/ports/document-review-store";
import type { RateLimitStore, SessionStore } from "@/application/ports/session-store";
import { InMemoryAssessmentStore } from "@/infrastructure/storage/in-memory-assessment-store";
import { InMemoryDocumentReviewStore } from "@/infrastructure/storage/in-memory-document-review-store";
import { InMemorySessionStore } from "@/infrastructure/storage/in-memory-session-store";
import { RedisAssessmentStore } from "@/infrastructure/storage/redis-assessment-store";
import { RedisDocumentReviewStore } from "@/infrastructure/storage/redis-document-review-store";
import { RedisSessionStore } from "@/infrastructure/storage/redis-session-store";
import { StorageUnavailableError } from "@/infrastructure/storage/storage-error";

type StorageProvider = {
  sessions: SessionStore;
  documents: DocumentReviewStore;
  assessments: AssessmentStore;
  rateLimits: RateLimitStore;
};

type GlobalStorage = typeof globalThis & {
  mcqforgeStorageProvider?: StorageProvider;
};

export function resolveStorageDriver(
  nodeEnvironment: string | undefined,
  requestedDriver: string | undefined,
): "memory" | "redis" {
  if (nodeEnvironment === "production" && requestedDriver !== "redis") {
    throw new StorageUnavailableError("configuration");
  }
  if (requestedDriver && requestedDriver !== "memory" && requestedDriver !== "redis") {
    throw new StorageUnavailableError("configuration");
  }
  if (requestedDriver === "memory" && nodeEnvironment === "production") {
    throw new StorageUnavailableError("configuration");
  }
  return (nodeEnvironment === "test" && requestedDriver !== "redis") ||
    requestedDriver === "memory"
    ? "memory"
    : "redis";
}

export function getStorageProvider(): StorageProvider {
  const globalStorage = globalThis as GlobalStorage;
  if (globalStorage.mcqforgeStorageProvider) {
    return globalStorage.mcqforgeStorageProvider;
  }

  const requestedDriver = process.env.MCQFORGE_STORAGE_DRIVER?.trim() || undefined;
  const useMemory =
    resolveStorageDriver(process.env.NODE_ENV, requestedDriver) === "memory";

  const sessions: SessionStore & RateLimitStore = useMemory
    ? new InMemorySessionStore()
    : new RedisSessionStore();
  const rateLimits = sessions;
  globalStorage.mcqforgeStorageProvider = useMemory
    ? {
        sessions,
        documents: new InMemoryDocumentReviewStore(sessions),
        assessments: new InMemoryAssessmentStore(sessions),
        rateLimits,
      }
    : {
        sessions,
        documents: new RedisDocumentReviewStore(sessions),
        assessments: new RedisAssessmentStore(sessions),
        rateLimits,
      };
  return globalStorage.mcqforgeStorageProvider;
}
