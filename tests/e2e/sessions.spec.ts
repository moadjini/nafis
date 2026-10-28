import { expect, open, pathOf, test } from "./fixtures";

test("requests, accepts and holds a live private conversation, then ends it", async ({ member }) => {
  const listener = await member("listener", { listener: true, displayName: "E2E Listener" });
  const seeker = await member("seeker", { displayName: "E2E Seeker" });
  const outsider = await member("outsider");

  // The seeker asks a specific available listener.
  await open(seeker.page, "/listening?view=private");
  await seeker.page.getByRole("radio", { name: /E2E Listener/ }).click();
  await seeker.page.getByLabel("A few words to start (optional)").fill("Could we talk this evening?");
  await seeker.page.getByRole("button", { name: "Send to E2E Listener" }).click();
  await expect(seeker.page).toHaveURL(/\/sessions\/[0-9a-f-]{36}$/);
  const sessionPath = pathOf(seeker.page);
  await expect(seeker.page.getByText("Waiting for a listener to accept. You'll be notified.")).toBeVisible();

  // Nobody else can open the conversation.
  await open(outsider.page, sessionPath);
  await expect(outsider.page.getByText("This conversation isn't available")).toBeVisible();

  // The listener accepts from their Listening page.
  await open(listener.page, "/listening?view=private");
  const request = listener.page.locator("li", { hasText: "Could we talk this evening?" });
  await expect(request).toContainText("E2E Seeker");
  await request.getByRole("button", { name: "Accept" }).click();
  await expect(listener.page).toHaveURL(new RegExp(`${sessionPath}$`));

  // The seeker's open page updates live (Realtime) without reloading.
  await expect(seeker.page.getByText("You're connected. Say hello whenever you're ready.")).toBeVisible();

  // Messages arrive live in both directions.
  await listener.page.getByLabel("Write a message…").fill("Hello, I'm here.");
  await listener.page.getByRole("button", { name: "Send" }).click();
  await expect(seeker.page.getByText("Hello, I'm here.")).toBeVisible();

  await seeker.page.getByLabel("Write a message…").fill("Thank you for accepting.");
  await seeker.page.getByLabel("Write a message…").press("Enter");
  await expect(listener.page.getByText("Thank you for accepting.")).toBeVisible();

  // The outsider still sees nothing, even with the exact URL.
  await open(outsider.page, sessionPath);
  await expect(outsider.page.getByText("Hello, I'm here.")).toHaveCount(0);

  // The seeker ends the conversation; both sides close.
  await seeker.page.getByRole("button", { name: "More options" }).click();
  await seeker.page.getByRole("menuitem", { name: "End conversation" }).click();
  await seeker.page.getByRole("dialog").getByRole("button", { name: "End conversation" }).click();
  await expect(seeker.page.getByText("This conversation has ended.")).toBeVisible();
  await expect(seeker.page.getByLabel("Write a message…")).toHaveCount(0);
  await expect(listener.page.getByText("This conversation has ended.")).toBeVisible();
  await expect(listener.page.getByLabel("Write a message…")).toHaveCount(0);

  // History stays readable for both participants.
  await open(listener.page, sessionPath);
  await expect(listener.page.getByText("Thank you for accepting.")).toBeVisible();
});

test("a listener can decline, and the seeker can withdraw a pending request", async ({ member }) => {
  const listener = await member("listener", { listener: true, displayName: "E2E Calm Listener" });
  const seeker = await member("seeker", { displayName: "E2E Asker" });

  // Declined request
  await open(seeker.page, "/listening?view=private");
  await seeker.page.getByRole("radio", { name: /E2E Calm Listener/ }).click();
  await seeker.page.getByLabel("A few words to start (optional)").fill("First request");
  await seeker.page.getByRole("button", { name: "Send to E2E Calm Listener" }).click();
  await expect(seeker.page).toHaveURL(/\/sessions\//);

  await open(listener.page, "/listening?view=private");
  await listener.page.locator("li", { hasText: "First request" }).getByRole("button", { name: "Decline" }).click();
  await expect(listener.page.getByText("Request declined.")).toBeVisible();
  await expect(seeker.page.getByText("This request wasn't accepted this time.").or(seeker.page.getByText("The listener wasn't able to accept this request."))).toBeVisible();

  // Withdrawn request
  await open(seeker.page, "/listening?view=private");
  await seeker.page.getByRole("radio", { name: /E2E Calm Listener/ }).click();
  await seeker.page.getByLabel("A few words to start (optional)").fill("Second request");
  await seeker.page.getByRole("button", { name: "Send to E2E Calm Listener" }).click();
  await expect(seeker.page.getByText("Waiting for a listener to accept. You'll be notified.")).toBeVisible();
  await seeker.page.getByRole("button", { name: "Withdraw request" }).click();
  await expect(seeker.page.getByText("This request was withdrawn.")).toBeVisible();

  await open(listener.page, "/listening?view=private");
  await expect(listener.page.locator("li", { hasText: "Second request" })).toHaveCount(0);
});
