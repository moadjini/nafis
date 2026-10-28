import { expect, open, test } from "./fixtures";

test("a new member is guided through onboarding and lands in the community", async ({ member }) => {
  const newcomer = await member("newcomer", { onboarded: false });
  const { page } = newcomer;

  await open(page, "/home");
  await expect(page).toHaveURL(/\/onboarding$/);

  // 1. Language — switching changes the interface immediately.
  await expect(page.getByRole("heading", { name: "Which language feels most comfortable?" })).toBeVisible();
  await page.getByRole("radio", { name: "Soomaali" }).click();
  await expect(page.getByRole("heading", { name: "Luqaddee ayaa kuugu raaxo badan?" })).toBeVisible();
  await page.getByRole("radio", { name: "English" }).click();
  await expect(page.getByRole("heading", { name: "Which language feels most comfortable?" })).toBeVisible();
  await page.getByRole("button", { name: "Continue" }).click();

  // 2. Pseudonym — too-short names are rejected; suggestions are offered.
  const name = page.getByLabel("Display name");
  await name.fill("x");
  await expect(page.getByRole("button", { name: "Continue" })).toBeDisabled();
  await page.getByRole("button", { name: "Suggest another" }).click();
  await expect(name).not.toHaveValue("x");
  await name.fill("E2E Gentle River");
  await page.getByRole("button", { name: "Continue" }).click();

  // 3. Avatar
  await page.getByRole("radio", { name: "Moon" }).click();
  await page.getByRole("button", { name: "Continue" }).click();

  // 4. Listening preferences
  await page.getByRole("switch", { name: "I'm open to private listening requests" }).click();
  await page.getByRole("button", { name: "Somali", exact: true }).click();
  await page.getByRole("button", { name: "Grief & loss" }).click();
  await page.getByRole("button", { name: "Continue" }).click();

  // 5. Privacy explanation
  await expect(page.getByRole("heading", { name: "How your privacy works" })).toBeVisible();
  await expect(page.getByText("They are not private.")).toBeVisible();
  await page.getByRole("button", { name: "Continue" }).click();

  // 6. Guidelines must be accepted
  const finish = page.getByRole("button", { name: "Continue" });
  await expect(finish).toBeDisabled();
  await page.getByLabel("I'll help keep Nafis a kind place").check();
  await finish.click();

  // 7. Enter Nafis
  await expect(page.getByRole("heading", { name: "Welcome to Nafis, E2E Gentle River." })).toBeVisible();
  await expect(page.getByRole("link", { name: "Share what's on your mind" })).toBeVisible();
  await page.getByRole("link", { name: "Explore the community" }).click();
  await expect(page).toHaveURL(/\/explore$/);

  // Persisted, and onboarding is not shown again.
  const { data: profile } = await newcomer.client
    .from("profiles")
    .select("display_name, avatar_key, onboarding_completed, preferred_language")
    .eq("id", newcomer.id)
    .single();
  expect(profile).toEqual({ display_name: "E2E Gentle River", avatar_key: "moon", onboarding_completed: true, preferred_language: "en" });

  const { data: prefs } = await newcomer.client.from("listening_preferences").select("available, languages, topics").eq("user_id", newcomer.id).single();
  expect(prefs?.available).toBe(true);
  expect([...(prefs?.languages ?? [])].sort()).toEqual(["en", "so"]);
  expect(prefs?.topics).toEqual(["grief"]);

  await open(page, "/onboarding");
  await expect(page).toHaveURL(/\/home$/);
});
