import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { getAuthenticatedSession } from "@/application/services/review-session";
import { TemporaryStorageConfigurationError } from "@/application/config/temporary-storage";
import {
  StorageRecordTooLargeError,
  StorageUnavailableError,
} from "@/infrastructure/storage/storage-error";

export function withStorageErrorHandling<Arguments extends unknown[]>(
  operation: (...arguments_: Arguments) => Promise<Response>,
): (...arguments_: Arguments) => Promise<Response> {
  return async (...arguments_) => {
    try {
      const response = await operation(...arguments_);
      response.headers.set("Cache-Control", "private, no-store");
      return response;
    } catch (error) {
      if (error instanceof StorageUnavailableError) {
        return NextResponse.json(
          {
            error: {
              code:
                error.kind === "configuration"
                  ? "temporary_storage_configuration_invalid"
                  : "temporary_storage_unavailable",
              message: error.message,
            },
          },
          { status: 503 },
        );
      }
      if (error instanceof StorageRecordTooLargeError) {
        return NextResponse.json(
          {
            error: {
              code: "storage_record_too_large",
              message: error.message,
            },
          },
          { status: 413 },
        );
      }
      if (error instanceof TemporaryStorageConfigurationError) {
        return NextResponse.json(
          {
            error: {
              code: "storage_configuration_invalid",
              message: error.message,
            },
          },
          { status: 503 },
        );
      }
      throw error;
    }
  };
}

export function rateLimitedResponse() {
  return NextResponse.json(
    {
      error: {
        code: "rate_limited",
        message: "Too many requests. Wait a minute and try again.",
      },
    },
    { status: 429, headers: { "Retry-After": "60" } },
  );
}

export async function requireAuthenticatedSession(
  request: NextRequest,
): Promise<
  | { sessionId: string; response?: never }
  | { sessionId?: never; response: Response }
> {
  const session = await getAuthenticatedSession(request);
  if (!session) {
    return {
      response: NextResponse.json(
        {
          error: {
            code: "session_unavailable",
            message: "Your temporary session is unavailable or has expired.",
          },
        },
        { status: 401 },
      ),
    };
  }
  return { sessionId: session.id };
}

export function csrfRejectedResponse() {
  return NextResponse.json(
    {
      error: {
        code: "csrf_rejected",
        message: "The request origin could not be verified. Reload the page and retry.",
      },
    },
    { status: 403 },
  );
}
