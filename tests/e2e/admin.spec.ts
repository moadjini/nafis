import { createPost, expect, open, test } from "./fixtures";

test("members cannot reach the admin area, even by URL", async ({ member }) => {
  const m = await member("member");
  for (const path of ["/admin", "/admin/users", "/admin/verification", "/admin/moderation", "/admin/analytics", "/admin/audit"]) {
    await open(m.page, path);
    await expect(m.page.getByText("The admin area is available to moderators and Super Admins."), path).toBeVisible();
    await expect(m.page.getByRole("navigation", { name: "Admin" })).toHaveCount(0);
  }
  await open(m.page, "/home");
  await m.page.getByRole("button", { name: "Account menu" }).click();
  await expect(m.page.getByRole("menuitem", { name: /Admin|Moderation/ })).toHaveCount(0);
});

test("moderators get the moderation center but not Super Admin sections", async ({ member }) => {
  const mod = await member("mod", { role: "moderator" });
  await open(mod.page, "/admin/moderation");
  await expect(mod.page.getByRole("heading", { name: "Moderation", level: 1 })).toBeVisible();
  const nav = mod.page.getByRole("navigation", { name: "Admin" }).first();
  await expect(nav.getByRole("link", { name: "Moderation" })).toBeVisible();
  await expect(nav.getByRole("link", { name: "Users" })).toHaveCount(0);

  for (const path of ["/admin", "/admin/users", "/admin/verification", "/admin/analytics"]) {
    await open(mod.page, path);
    await expect(mod.page.getByText("This section is available to Super Admins only."), path).toBeVisible();
  }
  await open(mod.page, "/admin/audit");
  await expect(mod.page.getByText(/As a moderator you see moderation actions/)).toBeVisible();
});

test("a Super Admin promotes a moderator and grants a verified badge that appears across the app", async ({ member }) => {
  const sa = await member("sa", { role: "super_admin", displayName: "E2E Super Admin" });
  const target = await member("target", { displayName: "E2E Badge Person" });
  const reader = await member("reader");
  const postText = `E2E verified author post ${Date.now()}`;
  const postId = await createPost(target, postText);

  // Overview with live statistics
  await open(sa.page, "/admin");
  await expect(sa.page.getByRole("heading", { name: "Overview" })).toBeVisible();
  await expect(sa.page.getByText("Registered accounts")).toBeVisible();

  // Search and promote
  await open(sa.page, `/admin/users?q=${target.handle}`);
  const row = sa.page.getByRole("row", { name: /E2E Badge Person/ });
  await expect(row).toBeVisible();
  await row.getByRole("button", { name: /Manage/ }).click();
  await sa.page.getByRole("menuitem", { name: "Make moderator" }).click();
  const roleDialog = sa.page.getByRole("dialog", { name: "Change E2E Badge Person's role to Moderator?" });
  await roleDialog.getByLabel("Reason (optional, recorded in the audit log)").fill("Trusted Somali-speaking member");
  await roleDialog.getByRole("button", { name: "Confirm" }).click();
  await expect(sa.page.getByText("Role updated.")).toBeVisible();
  await expect(row.getByText("Moderator", { exact: true })).toBeVisible();

  // Verify from the verification workflow
  await open(sa.page, `/admin/verification?view=unverified&q=${target.handle}`);
  const vrow = sa.page.getByRole("row", { name: /E2E Badge Person/ });
  await vrow.getByRole("button", { name: "Grant verified badge" }).click();
  const verifyDialog = sa.page.getByRole("dialog", { name: "Verify E2E Badge Person?" });
  await verifyDialog.getByRole("button", { name: "Grant verified badge" }).click();
  await expect(sa.page.getByText("Account verified.")).toBeVisible();
  await open(sa.page, "/admin/verification");
  await expect(sa.page.getByRole("row", { name: /E2E Badge Person/ })).toBeVisible();

  // The badge appears for other members: post header and profile
  await open(reader.page, `/post/${postId}`);
  const card = reader.page.locator("article", { hasText: postText });
  await expect(card.getByRole("img", { name: "Verified account" })).toHaveCount(1);
  await open(reader.page, `/profile/${target.handle}`);
  await expect(reader.page.getByRole("heading", { level: 1 }).getByRole("img", { name: "Verified account" })).toBeVisible();

  // History and audit trail
  await open(sa.page, `/admin/users/${target.handle}`);
  await expect(sa.page.getByText("Changed role")).toBeVisible();
  await expect(sa.page.getByText("Granted verified badge")).toBeVisible();
  // The reason shows in the role panel and in the history entry.
  await expect(sa.page.getByText("Trusted Somali-speaking member")).toHaveCount(2);

  // Revoke: the badge disappears
  await sa.page.getByRole("button", { name: /Manage/ }).click();
  await sa.page.getByRole("menuitem", { name: "Remove verified badge" }).click();
  await sa.page.getByRole("dialog").getByRole("button", { name: "Remove verified badge" }).click();
  await expect(sa.page.getByText("Verified badge removed.")).toBeVisible();
  await open(reader.page, `/post/${postId}`);
  await expect(reader.page.locator("article", { hasText: postText }).getByRole("img", { name: "Verified account" })).toHaveCount(0);
});

test("a Super Admin can suspend and restore a member, and analytics render real data", async ({ member }) => {
  const sa = await member("sa2", { role: "super_admin" });
  const target = await member("restricted", { displayName: "E2E Restricted Person" });

  await open(sa.page, `/admin/users/${target.handle}`);
  await sa.page.getByRole("button", { name: /Manage/ }).click();
  await sa.page.getByRole("menuitem", { name: "Suspend" }).click();
  const dialog = sa.page.getByRole("dialog", { name: "Suspend E2E Restricted Person?" });
  await dialog.getByLabel("Length (days)").fill("2");
  await dialog.getByRole("button", { name: "Suspend" }).click();
  await expect(sa.page.getByText("Account suspended.")).toBeVisible();

  await open(sa.page, "/admin/moderation?view=restrictions");
  const entry = sa.page.locator("li", { hasText: "E2E Restricted Person" });
  await expect(entry).toBeVisible();
  await entry.getByRole("button", { name: "Lift suspension" }).click();
  await sa.page.getByRole("dialog").getByRole("button", { name: "Lift suspension" }).click();
  await expect(sa.page.getByText("Suspension lifted.")).toBeVisible();

  await open(sa.page, "/admin/analytics");
  await expect(sa.page.getByRole("img", { name: /New accounts/ })).toBeVisible();
  await sa.page.locator("summary", { hasText: "Daily values" }).click();
  await expect(sa.page.getByRole("table")).toBeVisible();
});
