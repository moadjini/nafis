import { expect, open, pathOf, test, UUID_PATH } from "./fixtures";

test("writes, previews and publishes a text post", async ({ member }) => {
  const writer = await member("writer");
  const { page } = writer;
  await open(page, "/post/create");

  await page.getByLabel("Title or caption").fill("E2E evening thoughts");
  const body = page.getByLabel("Your post");

  // The support notice appears for crisis language but never blocks posting.
  await body.fill("Some nights I want to die and I don't know why.");
  await expect(page.getByText("It sounds like you're carrying something very heavy.")).toBeVisible();

  const text = `E2E text post ${Date.now()}`;
  await body.fill(text);
  await expect(page.getByText("It sounds like you're carrying something very heavy.")).toBeHidden();

  await page.getByLabel("Topic", { exact: true }).selectOption("work_money");
  await page.getByRole("radio", { name: "I'd appreciate advice." }).check();
  await page.getByRole("button", { name: "Preview" }).click();
  await expect(page.getByText("How it will look")).toBeVisible();

  await page.getByRole("button", { name: "Share with the community" }).click();
  await expect(page).toHaveURL(UUID_PATH);
  await expect(page.getByText(text)).toBeVisible();
  await expect(page.getByText("E2E evening thoughts")).toBeVisible();
  await expect(page.getByText("They'd welcome gentle, practical suggestions.")).toBeVisible();
  await expect(page.getByRole("link", { name: "Work & money" })).toBeVisible();

  await open(page, "/home");
  await expect(page.getByText(text)).toBeVisible();
});

test("keeps a draft private until it is published", async ({ member }) => {
  const writer = await member("drafter");
  const reader = await member("reader");
  const text = `E2E private draft ${Date.now()}`;

  await open(writer.page, "/post/create");
  await writer.page.getByLabel("Your post").fill(text);
  await writer.page.getByRole("button", { name: "Save as private draft" }).click();
  await expect(writer.page).toHaveURL(UUID_PATH);
  const postPath = pathOf(writer.page);
  await expect(writer.page.getByText("Draft", { exact: true })).toBeVisible();

  // Another member cannot open it.
  await open(reader.page, postPath);
  await expect(reader.page.getByText("This post isn't available")).toBeVisible();
  await expect(reader.page.getByText(text)).toHaveCount(0);

  // It is listed among the author's own drafts.
  await open(writer.page, "/profile/me");
  await expect(writer.page.getByRole("heading", { name: "Your private drafts" })).toBeVisible();
  await expect(writer.page.locator("#drafts").getByText(text)).toBeVisible();

  // Publishing from the edit page makes it visible to others.
  await open(writer.page, `${postPath}/edit`);
  await writer.page.getByRole("button", { name: "Share with the community" }).click();
  await expect(writer.page).toHaveURL(new RegExp(`${postPath}$`));
  await open(reader.page, postPath);
  await expect(reader.page.getByText(text)).toBeVisible();
});

test("asks before discarding unsent writing", async ({ member }) => {
  const writer = await member("cancel");
  await open(writer.page, "/post/create");
  await writer.page.getByLabel("Your post").fill("Not ready to share this yet.");
  await writer.page.getByRole("button", { name: "Cancel" }).click();

  const dialog = writer.page.getByRole("dialog", { name: "Leave without sharing?" });
  await expect(dialog).toBeVisible();
  await dialog.getByRole("button", { name: "Discard" }).click();
  await expect(writer.page).toHaveURL(/\/home$/);

  const { count } = await writer.client.from("posts").select("id", { count: "exact", head: true }).eq("author_id", writer.id);
  expect(count).toBe(0);
});

test("records a voice note with the microphone, publishes it and plays it back", async ({ member }) => {
  const speaker = await member("voice");
  const { page } = speaker;
  await open(page, "/post/create?type=voice");

  // Record, pause, resume, stop (Chromium supplies a fake microphone).
  await page.getByRole("button", { name: "Record", exact: true }).click();
  await expect(page.getByText("Recording", { exact: true })).toBeVisible();
  await page.waitForTimeout(1500);
  await page.getByRole("button", { name: "Pause" }).click();
  await expect(page.getByText("Paused", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Resume" }).click();
  await page.waitForTimeout(1500);
  await page.getByRole("button", { name: "Stop" }).click();

  // Preview with the option to start over.
  await expect(page.getByRole("button", { name: "Record again" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Play voice post" })).toBeVisible();

  await page.getByLabel("Title or caption").fill("E2E voice caption");
  await page.getByRole("radio", { name: "I'd like to hear from someone with a similar experience." }).check();
  await page.getByRole("button", { name: "Share with the community" }).click();
  await expect(page).toHaveURL(UUID_PATH, { timeout: 45_000 });
  await expect(page.getByText("E2E voice caption")).toBeVisible();

  // Stored with a measured duration and an allowed format.
  const { data: post } = await speaker.client
    .from("posts")
    .select("post_type, audio_duration_seconds, audio_mime_type, audio_storage_path")
    .eq("author_id", speaker.id)
    .single();
  expect(post?.post_type).toBe("voice");
  expect(post?.audio_duration_seconds).toBeGreaterThanOrEqual(2);
  expect(post?.audio_mime_type).toMatch(/^audio\/(webm|ogg|mp4)$/);
  expect(post?.audio_storage_path).not.toContain(speaker.id);

  // Playback fetches a short-lived signed URL that does not reveal the author.
  const signed = page.waitForRequest((request) => request.url().includes("/storage/v1/object/sign/voice-notes/"));
  await page.getByRole("button", { name: /^Play voice post/ }).click();
  const request = await signed;
  expect(request.url()).not.toContain(speaker.id);
  await page.waitForTimeout(1000);
  await expect(page.getByText("This recording couldn't be played.")).toHaveCount(0);
});
