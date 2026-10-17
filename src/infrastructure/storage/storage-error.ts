export class StorageUnavailableError extends Error {
  constructor(readonly kind: "unavailable" | "configuration" = "unavailable") {
    super(
      kind === "configuration"
        ? "Temporary storage configuration is missing or invalid."
        : "Temporary storage is unavailable. Retry shortly.",
    );
    this.name = "StorageUnavailableError";
  }
}

export class StorageRecordTooLargeError extends Error {
  constructor() {
    super("This document creates a temporary record larger than the configured storage limit.");
    this.name = "StorageRecordTooLargeError";
  }
}

export function isStorageUnavailableError(
  error: unknown,
): error is StorageUnavailableError {
  return error instanceof StorageUnavailableError;
}
