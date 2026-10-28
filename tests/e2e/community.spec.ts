import { createPost, expect, open, test } from "./fixtures";

test("one changeable reaction per person, with persisted counts", async ({ member }) => {
  const author = await member("author");
  const reader = await member("reader");
  const postId = await createPost(author, `E2E post for reactions ${Date.now()}`);
  const page = reader.page;

  await open(page, `/post/${postId}`);
  await page.getByRole("button", { name: "Respond with a reaction" }).click();
  await page.getByRole("button", { name: "Hug", exact: true }).click();
  await expect(page.getByRole("button", { name: "Hug: 1" })).toHaveAttribute("aria-pressed", "true");

  // Survives a reload, so it came from the database.
  await page.reload();
  await page.waitForLoadState("networkidle");
  await expect(page.getByRole("button", { name: "Hug: 1" })).toHaveAttribute("aria-pressed", "true");

  // Changing replaces the reaction instead of adding a second one.
  await page.getByRole("button", { name: "Your reaction: Hug" }).click();
  await page.getByRole("button", { name: "Heart", exact: true }).click();
  await expect(page.getByRole("button", { name: "Heart: 1" })).toHaveAttribute("aria-pressed", "true");
  await expect(page.getByRole("button", { name: /^Hug: / })).toHaveCount(0);

  // A second person joins by tapping the existing chip.
  await open(author.page, `/post/${postId}`);
  await author.page.getByRole("button", { name: "Heart: 1" }).click();
  await expect(author.page.getByRole("button", { name: "Heart: 2" })).toHaveAttribute("aria-pressed", "true");

  // Removing returns the persisted count (the author's heart remains).
  await page.getByRole("button", { name: "Your reaction: Heart" }).click();
  await page.getByRole("button", { name: "Remove your reaction" }).click();
  await expect(page.getByRole("button", { name: "Heart: 1" })).toHaveAttribute("aria-pressed", "false");

  const { data } = await reader.client.rpc("get_reaction_state", { p_target_type: "post", p_target_id: postId });
  expect(data).toEqual([{ reactions: { heart: 1 }, my_reaction: null }]);
});

test("replies with a gentle prompt, threads a response, edits, and notifies the author live", async ({ member }) => {
  const author = await member("author");
  const reader = await member("reader");
  const postId = await createPost(author, `E2E post for replies ${Date.now()}`, "just_listen");

  // The author watches their notification badge (Supabase Realtime).
  await open(author.page, "/home");
  await expect(author.page.getByRole("link", { name: "Notifications", exact: true })).toBeVisible();

  await open(reader.page, `/post/${postId}`);
  await expect(reader.page.getByText("They'd prefer to be heard rather than receive advice.")).toBeVisible();

  const composer = reader.page.locator("form").filter({ has: reader.page.getByLabel("Your reply") });
  await composer.getByRole("button", { name: "I'm here to listen." }).click();
  await expect(composer.getByLabel("Your reply")).toHaveValue("I'm here to listen.");
  await composer.getByLabel("Your reply").fill("I'm here to listen. Take your time.");
  await composer.getByRole("button", { name: "Reply", exact: true }).click();
  const readerReply = reader.page.locator("article", { hasText: "Take your time." });
  await expect(readerReply).toBeVisible();

  await expect(author.page.getByRole("link", { name: "Notifications — 1 unread" })).toBeVisible();

  // The author answers inside the thread and is marked as the author.
  await open(author.page, `/post/${postId}`);
  await author.page.locator("article", { hasText: "Take your time." }).getByRole("button", { name: "Reply", exact: true }).click();
  const nested = author.page.locator("form", { hasText: "Replying to E2E reader" });
  await nested.getByLabel("Your reply").fill("Thank you for being here.");
  await nested.getByRole("button", { name: "Reply", exact: true }).click();
  const authorReply = author.page.locator("article", { hasText: "Thank you for being here." });
  await expect(authorReply).toBeVisible();
  await expect(authorReply.getByText("Author", { exact: true })).toBeVisible();

  // The reader edits their own reply.
  await reader.page.reload();
  await reader.page.waitForLoadState("networkidle");
  const ownReply = reader.page.locator("article", { hasText: "Take your time." }).first();
  await ownReply.getByRole("button", { name: "More options" }).click();
  await reader.page.getByRole("menuitem", { name: "Edit reply" }).click();
  await reader.page.getByLabel("Edit reply").fill("I'm here to listen. Take all the time you need.");
  await reader.page.getByRole("button", { name: "Save", exact: true }).click();
  await expect(reader.page.locator("article", { hasText: "Take all the time you need." }).getByText(/edited/)).toBeVisible();

  // Both nested reply and edit are visible to the author after a reload.
  await open(author.page, `/post/${postId}`);
  await expect(author.page.getByText("Take all the time you need.")).toBeVisible();
  await expect(author.page.getByText("Thank you for being here.")).toBeVisible();

  await open(author.page, "/notifications");
  await expect(author.page.getByText("E2E reader replied to your post.")).toBeVisible();
});

test("saves posts privately and reports them confidentially", async ({ member, }) => {
  const author = await member("author");
  const reader = await member("reader");
  const text = `E2E post to save ${Date.now()}`;
  const postId = await createPost(author, text);

  await open(reader.page, `/post/${postId}`);
  await reader.page.getByRole("button", { name: "Save post" }).click();
  await expect(reader.page.getByText("Saved privately. Only you can see your saved posts.")).toBeVisible();
  await open(reader.page, "/saved");
  await expect(reader.page.getByText(text)).toBeVisible();

  // Saving never notifies the author.
  const { count } = await author.client.from("notifications").select("id", { count: "exact", head: true });
  expect(count).toBe(0);

  await open(reader.page, `/post/${postId}`);
  await reader.page.locator("article").first().getByRole("button", { name: "More options" }).click();
  await reader.page.getByRole("menuitem", { name: "Report post" }).click();
  const dialog = reader.page.getByRole("dialog", { name: "Report post" });
  await dialog.getByRole("radio", { name: "Spam or scams" }).check();
  await dialog.getByLabel("Anything else we should know?").fill("E2E report");
  await dialog.getByRole("button", { name: "Send report" }).click();
  await expect(reader.page.getByText("Thank you. Our moderators will review this.")).toBeVisible();

  // Neither member can read reports.
  const { error } = await author.client.from("reports").select("id");
  expect(error?.code).toBe("42501");
});
