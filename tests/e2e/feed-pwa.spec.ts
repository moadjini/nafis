import { createPost, expect, open, test } from "./fixtures";

test("a Super Admin boosts a post and adds free likes; members see it first in Top without any label", async ({ member }) => {
  const sa = await member("sa", { role: "super_admin" });
  const author = await member("author");
  const reader = await member("reader");
  const stamp = Date.now();
  const target = await createPost(author, `E2E boost target ${stamp}`);
  await createPost(author, `E2E newer post ${stamp}`);
  const newest = await createPost(author, `E2E newest post ${stamp}`);

  // Boost and free likes from the post menu
  await open(sa.page, `/post/${target}`);
  await sa.page.getByRole("button", { name: "More options" }).click();
  await sa.page.getByRole("menuitem", { name: "Boost post" }).click();
  const boostDialog = sa.page.getByRole("dialog", { name: "Boost this post" });
  await boostDialog.getByLabel("Boost for").selectOption("24");
  await boostDialog.getByLabel("Note for the audit log (optional)").fill("Community highlight");
  await boostDialog.getByRole("button", { name: "Boost post" }).click();
  await expect(sa.page.getByText("Post boosted.")).toBeVisible();
  await expect(sa.page.locator("article").getByText("Boosted", { exact: true })).toBeVisible();

  await sa.page.getByRole("button", { name: "More options" }).click();
  await sa.page.getByRole("menuitem", { name: "Give free likes" }).click();
  const likesDialog = sa.page.getByRole("dialog", { name: "Free likes for this post" });
  await likesDialog.getByLabel("Number of free likes").fill("25");
  await likesDialog.getByRole("button", { name: "Save" }).click();
  await expect(sa.page.getByText("Free likes updated.")).toBeVisible();

  // Members: first in Top, hearts include the free likes, no badge, no controls
  await open(reader.page, "/home");
  const first = reader.page.locator("main article").first();
  await expect(first).toContainText(`E2E boost target ${stamp}`);
  await expect(first.getByRole("button", { name: "Heart: 25" })).toBeVisible();
  await expect(first.getByText("Boosted", { exact: true })).toHaveCount(0);
  await first.getByRole("button", { name: "More options" }).click();
  await expect(reader.page.getByRole("menuitem", { name: "Boost post" })).toHaveCount(0);
  await reader.page.keyboard.press("Escape");

  // Latest stays chronological
  await reader.page.getByRole("link", { name: "Latest" }).click();
  await expect(reader.page).toHaveURL(/sort=latest/);
  await expect(reader.page.locator("main article").first()).toContainText(`E2E newest post ${stamp}`);
  expect(newest).toBeTruthy();

  // Oversight: promotions list and audit trail; removing the boost
  await open(sa.page, "/admin/promotions");
  const entry = sa.page.locator("li", { hasText: `E2E boost target ${stamp}` });
  await expect(entry.getByText("25", { exact: true })).toBeVisible();
  await entry.getByRole("button", { name: "Remove boost" }).click();
  await expect(sa.page.getByText("Boost removed.")).toBeVisible();
  await open(sa.page, `/admin/audit?who=${author.handle}`);
  const audit = sa.page.getByRole("main").getByRole("list");
  await expect(audit.getByText("Boosted post")).toBeVisible();
  await expect(audit.getByText("Changed free likes")).toBeVisible();
  await expect(audit.getByText("0 → 25 free likes")).toBeVisible();
});

test("Nafis is installable: manifest, icons, service worker and an offline page", async ({ member }) => {
  const m = await member("pwa");
  await open(m.page, "/home");

  const manifest = await (await m.page.request.get("/manifest.webmanifest")).json();
  expect(manifest).toMatchObject({ name: "Nafis", display: "standalone", start_url: "/home", scope: "/" });
  expect(manifest.icons.map((i: { purpose: string }) => i.purpose).sort()).toEqual(["any", "any", "maskable"]);
  for (const icon of manifest.icons as { src: string }[]) {
    const res = await m.page.request.get(icon.src);
    expect(res.status(), icon.src).toBe(200);
    expect(res.headers()["content-type"]).toContain("image/png");
  }
  await expect(m.page.locator('link[rel="manifest"]')).toHaveAttribute("href", "/manifest.webmanifest");

  const sw = await m.page.request.get("/sw.js");
  expect(sw.headers()["cache-control"]).toContain("no-cache");
  const scriptURL = await m.page.evaluate(async () => (await navigator.serviceWorker.ready).active?.scriptURL);
  expect(scriptURL).toMatch(/\/sw\.js$/);
  await m.page.waitForFunction(() => Boolean(navigator.serviceWorker.controller));

  // Pages are never cached: offline shows the fallback page, not the feed.
  await m.context.setOffline(true);
  await m.page.reload();
  await expect(m.page.getByRole("heading", { name: "You're offline" })).toBeVisible();
  await expect(m.page.getByText("E2E", { exact: false })).toHaveCount(0);
  await m.context.setOffline(false);
});
