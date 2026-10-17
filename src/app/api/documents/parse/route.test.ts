import { describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { POST } from "./route";

function createRequest(file?: File) {
  const formData = new FormData();
  if (file) formData.set("file", file);
  return new NextRequest("http://localhost/api/documents/parse", {
    method: "POST",
    headers: { origin: "http://localhost" },
    body: formData,
  });
}

describe("POST /api/documents/parse", () => {
  it("rejects uploads without a verified same-origin header", async () => {
    const formData = new FormData();
    formData.set("file", new File(["Q1: a"], "questions.txt", { type: "text/plain" }));
    const response = await POST(new NextRequest("http://localhost/api/documents/parse", {
      method: "POST",
      body: formData,
    }));
    expect(response.status).toBe(403);
    expect((await response.json()).error.code).toBe("csrf_rejected");
  });

  it("returns parsed TXT questions and review counts", async () => {
    const file = new File(
      [
        "Q1: Pick one\nA) First\nB) Second\nC) Third\nD) Fourth\nAnswer: B",
      ],
      "questions.txt",
      { type: "text/plain" },
    );
    const response = await POST(createRequest(file));
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body).toMatchObject({
      revision: 0,
      summary: {
        totalQuestions: 1,
        validQuestions: 1,
        questionsRequiringReview: 0,
      },
    });
    expect(body.documentId).toBeTruthy();
    expect(body.questions).toBeUndefined();
    const cookie = response.headers.get("set-cookie");
    expect(cookie).toContain("HttpOnly");
    expect(cookie).toContain("SameSite=lax");
  });

  it("returns actionable validation errors for missing or invalid uploads", async () => {
    const missingFileResponse = await POST(createRequest());
    expect(missingFileResponse.status).toBe(400);
    expect((await missingFileResponse.json()).error.message).toContain("Choose");

    const invalidFileResponse = await POST(
      createRequest(new File(["not a pdf"], "not-a-pdf.pdf", { type: "application/pdf" })),
    );
    expect(invalidFileResponse.status).toBe(415);
    expect((await invalidFileResponse.json()).error.code).toBe("invalid_signature");
  });

  it("rejects files over the configured limit even without a content-length header", async () => {
    vi.stubEnv("MAX_DOCUMENT_UPLOAD_BYTES", "1024");
    try {
      const response = await POST(
        createRequest(
          new File([new Uint8Array(1025)], "oversized.txt", {
            type: "text/plain",
          }),
        ),
      );
      expect(response.status).toBe(413);
      expect((await response.json()).error.code).toBe("resource_limit");
    } finally {
      vi.unstubAllEnvs();
    }
  });
});
