import { adminClient } from "../support/supabase";
import { expect, open, test, type Member } from "./fixtures";

// Notification permissions only behave like a real browser in full Chromium
// (the default headless shell always reports "denied").
test.use({ channel: "chromium" });

/**
 * Headless browsers cannot register with a real push service (FCM, Mozilla,
 * Apple), so only PushManager.subscribe/getSubscription are replaced with a
 * stand-in that returns a well-formed subscription. Everything else is real:
 * the permission prompt flow, the server action, the database and sign-out.
 */
async function stubPushService(m: Member) {
  await m.context.addInitScript(() => {
    const KEY = "__e2eFakePush";
    const b64 = (n: number) => {
      const bytes = new Uint8Array(n);
      crypto.getRandomValues(bytes);
      return btoa(String.fromCharCode(...bytes)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
    };
    const make = (json: { endpoint: string; keys: { p256dh: string; auth: string } }) => ({
      endpoint: json.endpoint,
      toJSON: () => json,
      unsubscribe: async () => {
        localStorage.removeItem(KEY);
        return true;
      },
    });
    const stored = () => {
      const raw = localStorage.getItem(KEY);
      return raw ? make(JSON.parse(raw)) : null;
    };
    PushManager.prototype.getSubscription = async function () {
      return stored() as unknown as PushSubscription;
    };
    PushManager.prototype.subscribe = async function () {
      const json = { endpoint: `https://push.example.test/e2e/${b64(24)}`, keys: { p256dh: b64(65), auth: b64(16) } };
      localStorage.setItem(KEY, JSON.stringify(json));
      return make(json) as unknown as PushSubscription;
    };
  });
}

test("after about 12 seconds of use Nafis offers notifications once, and 'Not now' is remembered", async ({ member, browser, baseURL }) => {
  const m = await member("prompt");
  // Granting any permission through Playwright denies all others, so this
  // check uses a context with none granted: notifications are still "ask".
  const context = await browser.newContext({ baseURL, locale: "en-US" });
  await context.addCookies((await m.context.cookies()).map((c) => ({ ...c })));
  const page = await context.newPage();
  try {
    await page.clock.install();
    await open(page, "/home");
    expect(await page.evaluate(() => Notification.permission)).toBe("default");
    const prompt = page.getByRole("dialog", { name: "Turn on notifications?" });
    const engaged = () => page.evaluate(() => Number(sessionStorage.getItem("nafis:engaged-seconds") ?? 0));

    // The fake clock also holds back hydration: tick until the counter is running.
    await expect
      .poll(async () => {
        await page.clock.runFor(1_000);
        return engaged();
      })
      .toBeGreaterThan(0);
    await page.clock.runFor((10 - (await engaged())) * 1_000);
    expect(await engaged()).toBeLessThan(12);
    await expect(prompt).toHaveCount(0);
    await page.clock.runFor(2_000);
    await expect(prompt).toBeVisible();
    await expect(prompt).toContainText("never show what anyone wrote");

    await prompt.getByRole("button", { name: "Not now" }).click();
    await expect(prompt).toHaveCount(0);
    await open(page, "/explore");
    await page.clock.runFor(20_000);
    await expect(prompt).toHaveCount(0);
  } finally {
    await context.close();
  }
});

test("accepting the prompt subscribes this device; signing out removes the subscription", async ({ member }) => {
  const m = await member("push");
  await m.context.grantPermissions(["notifications"]);
  await stubPushService(m);
  const admin = adminClient();
  const count = async () => (await admin.from("push_subscriptions").select("id", { count: "exact", head: true }).eq("user_id", m.id)).count;

  // Permission already granted: Settings turns it on directly.
  await open(m.page, "/settings");
  const toggle = m.page.getByRole("switch", { name: "Notifications on this device" });
  await expect(toggle).toBeEnabled();
  await toggle.click();
  await expect(m.page.getByText("Notifications are on for this device.").first()).toBeVisible();
  await expect(toggle).toBeChecked();
  await expect.poll(count).toBe(1);

  // Turning it off forgets the device; on again re-registers it.
  await toggle.click();
  await expect(m.page.getByText("Notifications are off for this device.")).toBeVisible();
  await expect.poll(count).toBe(0);
  await toggle.click();
  await expect.poll(count).toBe(1);

  // Signing out removes it, so the next person on this browser gets nothing.
  await m.page.getByRole("button", { name: "Account menu" }).click();
  await m.page.getByRole("menuitem", { name: "Sign out" }).click();
  await expect(m.page).toHaveURL(/localhost:\d+\/($|auth)/);
  await expect.poll(count).toBe(0);
});

test("another account signing in on the same browser does not inherit the first one's notifications", async ({ member }) => {
  const first = await member("push-a");
  await first.context.grantPermissions(["notifications"]);
  await stubPushService(first);
  await open(first.page, "/settings");
  await first.page.getByRole("switch", { name: "Notifications on this device" }).click();
  const admin = adminClient();
  await expect.poll(async () => (await admin.from("push_subscriptions").select("id").eq("user_id", first.id)).data?.length).toBe(1);

  // Same browser profile, different account (session expired rather than signed out).
  const second = await member("push-b");
  const cookies = await second.context.cookies();
  await first.context.clearCookies();
  await first.context.addCookies(cookies);
  await open(first.page, "/home");
  await expect.poll(async () => (await admin.from("push_subscriptions").select("id").eq("user_id", first.id)).data?.length).toBe(0);
  expect((await admin.from("push_subscriptions").select("id").eq("user_id", second.id)).data).toEqual([]);
});
