import sharp from "sharp";
import { expect, open, test } from "./fixtures";

test("uploads, crops and removes a profile picture, stored only as a re-encoded image", async ({ member }) => {
  const m = await member("avatar", { displayName: "E2E Picture Person" });
  const page = m.page;

  // A photo with EXIF metadata that must not survive.
  const photo = await sharp({ create: { width: 1200, height: 800, channels: 3, background: { r: 120, g: 180, b: 140 } } })
    .withExif({ IFD0: { Copyright: "e2e-private-metadata" } })
    .jpeg()
    .toBuffer();

  await open(page, "/settings");
  await page.locator('input[type="file"][accept*="image"]').setInputFiles({ name: "me.jpg", mimeType: "image/jpeg", buffer: photo });

  const dialog = page.getByRole("dialog", { name: "Position your picture" });
  await expect(dialog).toBeVisible();
  await dialog.getByRole("slider").fill("1.5");
  await dialog.getByRole("button", { name: "Save picture" }).click();
  await expect(page.getByText("Profile picture updated.")).toBeVisible();

  // The account menu shows the uploaded picture from the public avatars bucket.
  const img = page.getByRole("button", { name: "Account menu" }).locator("img");
  await expect(img).toHaveAttribute("src", /\/storage\/v1\/object\/public\/avatars\/[0-9a-f-]{36}\.webp$/);
  const src = (await img.getAttribute("src"))!;
  expect(src).not.toContain(m.id);

  const stored = Buffer.from(await (await fetch(src)).arrayBuffer());
  const meta = await sharp(stored).metadata();
  expect(meta.format).toBe("webp");
  expect([meta.width, meta.height]).toEqual([512, 512]);
  expect(meta.exif).toBeUndefined();
  expect(stored.includes(Buffer.from("e2e-private-metadata"))).toBe(false);

  // Rejected client-side: wrong type
  await page.locator('input[type="file"][accept*="image"]').setInputFiles({ name: "notes.svg", mimeType: "image/svg+xml", buffer: Buffer.from("<svg/>") });
  await expect(page.getByText("Choose a JPEG, PNG or WebP image.")).toBeVisible();

  // Remove
  await page.getByRole("button", { name: "Remove picture" }).click();
  await expect(page.getByText("Profile picture removed.")).toBeVisible();
  await expect(page.getByRole("button", { name: "Account menu" }).locator("img")).toHaveCount(0);
  const { data } = await m.client.from("profiles").select("avatar_path").eq("id", m.id).single();
  expect(data?.avatar_path).toBeNull();
});
