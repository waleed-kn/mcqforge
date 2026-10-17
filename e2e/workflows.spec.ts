import { expect, test } from "@playwright/test";
import { resolve } from "node:path";

const fixturePath = resolve(process.cwd(), "e2e/fixtures/basic-mcqs.txt");

async function uploadFixture(page: import("@playwright/test").Page) {
  page.on("pageerror", (error) => console.error("Browser page error:", error.message));
  await page.goto("/");
  await page.getByLabel("Choose a study document").setInputFiles(fixturePath);
  const uploadResponsePromise = page.waitForResponse((response) =>
    response.url().endsWith("/api/documents/parse"),
  );
  await page.getByRole("button", { name: /Extract questions/ }).click();
  const uploadResponse = await uploadResponsePromise;
  if (!uploadResponse.ok()) {
    throw new Error(
      `Fixture upload failed (${uploadResponse.status()}): ${await uploadResponse.text()}`,
    );
  }
  await expect(page.locator("#upload-error")).toBeHidden();
  await expect(page).toHaveURL(/\/review\/[0-9a-f-]+$/);
  await expect(page.getByRole("heading", { name: "Make every question yours." })).toBeVisible();
}

test("uploads, edits, answers, submits, and protects a test by session", async ({
  page,
  browser,
}) => {
  await uploadFixture(page);
  await page.setViewportSize({ width: 360, height: 800 });
  expect(
    await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth),
  ).toBe(true);
  await page.setViewportSize({ width: 1280, height: 900 });
  const prompt = page.getByLabel("Question text");
  await prompt.fill("Which planet is commonly called the Red Planet?");
  await page.getByRole("button", { name: /Save question/ }).click();
  await expect(page.getByRole("status").filter({ hasText: "Question saved." })).toBeVisible();
  await page.reload();
  await expect(page.getByLabel("Question text")).toHaveValue(
    "Which planet is commonly called the Red Planet?",
  );

  const confirmationResponsePromise = page.waitForResponse(
    (response) =>
      response.url().endsWith("/confirm") &&
      response.request().method() === "POST",
  );
  await page.getByRole("button", { name: /Confirm set & continue/ }).click();
  const confirmationResponse = await confirmationResponsePromise;
  if (!confirmationResponse.ok()) {
    throw new Error(
      `Review confirmation failed (${confirmationResponse.status()}): ${await confirmationResponse.text()}`,
    );
  }
  await expect(page).toHaveURL(/\/configure\/[0-9a-f-]+$/);
  await page.getByLabel("Questions in this test").selectOption("2");
  await page.getByRole("radio", { name: /^Timed/ }).check();
  await page.getByLabel("Duration").selectOption("15");
  await page.getByRole("radio", { name: /^Untimed/ }).check();
  await page.getByRole("button", { name: "Start test" }).click();
  await expect(page).toHaveURL(/\/test\/[0-9a-f-]+$/);

  const assessmentUrl = page.url();
  for (let index = 0; index < 2; index += 1) {
    const promptText = await page.locator(".test-question-panel h2").innerText();
    const isPlanetQuestion = promptText.includes("Red Planet");
    const startingOption = page.getByRole(
      "radio",
      { name: isPlanetQuestion ? /A Venus/ : /B Four/ },
    );
    const answer = page.getByRole("radio", {
      name: isPlanetQuestion ? /B Mars/ : /A Three/,
    });
    await startingOption.focus();
    await page.keyboard.press(isPlanetQuestion ? "ArrowDown" : "ArrowUp");
    await expect(answer).toBeChecked();
    await expect(page.getByText("SAVED", { exact: true })).toBeVisible();
    if (index === 0) {
      const next = page.getByRole("button", { name: "Next →" });
      await next.focus();
      await page.keyboard.press("Enter");
    }
  }

  const previous = page.getByRole("button", { name: "← Previous" });
  await previous.focus();
  await page.keyboard.press("Enter");
  const firstPrompt = await page.locator(".test-question-panel h2").innerText();
  await expect(
    page.getByRole("radio", {
      name: firstPrompt.includes("Red Planet") ? /B Mars/ : /A Three/,
    }),
  ).toBeChecked();
  await page.getByRole("button", { name: "Submit test" }).click();
  const dialog = page.getByRole("dialog", { name: "Submit this test?" });
  await expect(dialog).toContainText("2 answered · 0 unanswered");
  const keepWorking = dialog.getByRole("button", { name: "Keep working" });
  const submitNow = dialog.getByRole("button", { name: "Submit now" });
  await expect(keepWorking).toBeFocused();
  await page.keyboard.press("Tab");
  await expect(submitNow).toBeFocused();
  await page.keyboard.press("Tab");
  await expect(keepWorking).toBeFocused();
  await page.keyboard.press("Escape");
  await expect(dialog).toBeHidden();
  await expect(page.getByRole("button", { name: "Submit test" })).toBeFocused();
  await page.getByRole("button", { name: "Submit test" }).click();
  await expect(dialog).toBeVisible();
  const submissionResponsePromise = page.waitForResponse(
    (response) =>
      response.url().includes("/api/tests/") &&
      response.request().method() === "POST",
  );
  await dialog.getByRole("button", { name: "Submit now" }).click();
  const submissionResponse = await submissionResponsePromise;
  if (!submissionResponse.ok()) {
    throw new Error(
      `Submission failed (${submissionResponse.status()}): ${await submissionResponse.text()}`,
    );
  }
  await expect(page).toHaveURL(/\/results\/[0-9a-f-]+$/);
  await expect(page.getByRole("heading", { name: "2/2" })).toBeVisible();
  await expect(page.getByText("100%", { exact: false })).toBeVisible();
  await expect(page.getByText("Correct", { exact: true })).toHaveCount(3);
  await page.setViewportSize({ width: 360, height: 800 });
  expect(
    await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth),
  ).toBe(true);

  const otherSession = await browser.newContext();
  try {
    const otherPage = await otherSession.newPage();
    await otherPage.goto(assessmentUrl);
    await expect(
      otherPage.getByRole("heading", { name: "This test is unavailable." }),
    ).toBeVisible();
  } finally {
    await otherSession.close();
  }
});

test("shows timed state and server-derived countdown without exposing answers", async ({
  page,
}) => {
  await uploadFixture(page);
  await page.getByRole("button", { name: /Confirm set & continue/ }).click();
  await expect(page).toHaveURL(/\/configure\/[0-9a-f-]+$/);
  await page.getByRole("radio", { name: /^Timed/ }).check();
  await expect(page.getByLabel("Duration")).toBeVisible();
  await page.getByRole("button", { name: "Start test" }).click();
  await expect(page).toHaveURL(/\/test\/[0-9a-f-]+$/);
  await expect(page.getByRole("timer")).toHaveAttribute(
    "aria-label",
    /^\d{2}:\d{2} remaining$/,
  );
  await expect(page.getByText("Answer: B")).toHaveCount(0);
});

test("rejects corrupt, oversized, and unsupported uploads accessibly", async ({
  page,
}) => {
  await page.goto("/");
  await page.getByLabel("Choose a study document").setInputFiles({
    name: "corrupt.pdf",
    mimeType: "application/pdf",
    buffer: Buffer.from("not a PDF"),
  });
  await page.getByRole("button", { name: /Extract questions/ }).click();
  await expect(page.locator("#upload-error")).toContainText("valid PDF signature");

  await page.getByLabel("Choose a study document").setInputFiles({
    name: "too-large.txt",
    mimeType: "text/plain",
    buffer: Buffer.alloc(4 * 1024 * 1024 + 1, "x"),
  });
  await page.getByRole("button", { name: /Extract questions/ }).click();
  await expect(page.locator("#upload-error")).toContainText("file is too large");

  await page.getByLabel("Choose a study document").setInputFiles({
    name: "unsupported.exe",
    mimeType: "application/octet-stream",
    buffer: Buffer.from("binary"),
  });
  await expect(page.locator("#upload-error")).toContainText("Choose a PDF, DOCX, or TXT");
});

test("keeps the landing page usable at a narrow viewport", async ({ page }) => {
  await page.setViewportSize({ width: 360, height: 800 });
  await page.goto("/");
  await expect(page.getByRole("heading", { name: /Turn your notes into practice/ })).toBeVisible();
  expect(
    await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth),
  ).toBe(true);
  await page.keyboard.press("Tab");
  await expect(page.getByRole("link", { name: "MCQForge home" })).toBeFocused();
});
