import { randomUUID } from "node:crypto";
import type { NextRequest, NextResponse } from "next/server";
import { reviewSessionCookieName } from "@/application/config/document-review";

export function getOrCreateReviewOwner(request: NextRequest) {
  const existing = request.cookies.get(reviewSessionCookieName)?.value;
  const ownerId = getReviewOwnerFromCookie(existing);
  return ownerId
    ? { ownerId, isNew: false }
    : { ownerId: randomUUID(), isNew: true };
}

export function getReviewOwnerFromCookie(value: string | undefined) {
  return value && /^[0-9a-f-]{36}$/i.test(value) ? value : null;
}

export function setReviewOwnerCookie(response: NextResponse, ownerId: string) {
  response.cookies.set(reviewSessionCookieName, ownerId, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 2 * 60 * 60,
  });
}
