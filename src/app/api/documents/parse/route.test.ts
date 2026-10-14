import { describe, expect, it } from "vitest";
import { POST } from "./route";

function createRequest(file?: File) {
  const formData = new FormData();
  if (file) formData.set("file", file);
  return new Request("http://localhost/api/documents/parse", {
    method: "POST",
    body: formData,
  });
}

describe("POST /api/documents/parse", () => {
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
      status: "completed",
      totalQuestions: 1,
      validQuestions: 1,
      questionsRequiringReview: 0,
    });
    expect(body.questions[0].correctOption).toBe("B");
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
});
