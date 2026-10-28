// Generates the PWA / notification icons in public/icons from the Nafis leaf
// mark (same artwork as src/app/icon.svg). Run after changing the logo:
//   npm run icons:generate
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import sharp from "sharp";

const GREEN = "#15803d";
const LEAF = `<path d="M16 6.5c5.6 2.2 8.2 6.6 7.4 11.6-.6 3.9-3.6 6.9-7.4 7.4-3.8-.5-6.8-3.5-7.4-7.4-.8-5 1.8-9.4 7.4-11.6Z" fill="#fff"/>`;
const VEINS = `<path d="M16 10.5v13M16 15.2c1.6-1 2.8-1.3 3.8-1.2M16 19c-1.6-1-2.8-1.3-3.8-1.2" stroke="${GREEN}" stroke-width="1.5" stroke-linecap="round" fill="none"/>`;

const scaled = (content, scale) => `<g transform="translate(16 16) scale(${scale}) translate(-16 -16)">${content}</g>`;
const svg = (body) => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32">${body}</svg>`;

const icons = [
  // Standard icon: rounded tile, like the favicon.
  { file: "icon-192.png", size: 192, body: `<rect width="32" height="32" rx="10" fill="${GREEN}"/>${LEAF}${VEINS}` },
  { file: "icon-512.png", size: 512, body: `<rect width="32" height="32" rx="10" fill="${GREEN}"/>${LEAF}${VEINS}` },
  // Maskable: full bleed, artwork inside the 80% safe zone.
  { file: "maskable-512.png", size: 512, body: `<rect width="32" height="32" fill="${GREEN}"/>${scaled(LEAF + VEINS, 0.8)}` },
  // Android status-bar badge: white silhouette on transparent.
  { file: "badge-96.png", size: 96, body: scaled(LEAF, 1.25) },
];

const TILE = `<rect width="32" height="32" rx="10" fill="${GREEN}"/>${LEAF}${VEINS}`;
const render = (body, size) =>
  sharp(Buffer.from(svg(body)), { density: Math.ceil((72 * size) / 32) })
    .resize(size, size)
    .png({ compressionLevel: 9 })
    .toBuffer();

/** A .ico holding PNG images (supported by every current browser and OS). */
function ico(images) {
  const header = Buffer.alloc(6);
  header.writeUInt16LE(1, 2); // type: icon
  header.writeUInt16LE(images.length, 4);
  const entries = Buffer.alloc(16 * images.length);
  let offset = header.length + entries.length;
  images.forEach(({ size, data }, i) => {
    const at = i * 16;
    entries.writeUInt8(size % 256, at); // 0 means 256
    entries.writeUInt8(size % 256, at + 1);
    entries.writeUInt16LE(1, at + 4); // colour planes
    entries.writeUInt16LE(32, at + 6); // bits per pixel
    entries.writeUInt32LE(data.length, at + 8);
    entries.writeUInt32LE(offset, at + 12);
    offset += data.length;
  });
  return Buffer.concat([header, entries, ...images.map((image) => image.data)]);
}

const outDir = path.join(process.cwd(), "public", "icons");
await mkdir(outDir, { recursive: true });

for (const icon of icons) {
  await writeFile(path.join(outDir, icon.file), await render(icon.body, icon.size));
  console.log(`wrote public/icons/${icon.file}`);
}

// Next.js file conventions in src/app: favicon.ico (for browsers and tools that
// ask for /favicon.ico), apple-icon.png (iOS home screen). icon.svg is hand-made.
const appDir = path.join(process.cwd(), "src", "app");
// At 16 px the veins blur, so the smallest size is a larger, plain leaf.
const TILE_SMALL = `<rect width="32" height="32" rx="8" fill="${GREEN}"/>${scaled(LEAF, 1.3)}`;
const favicon = ico(
  await Promise.all([16, 32, 48].map(async (size) => ({ size, data: await render(size === 16 ? TILE_SMALL : TILE, size) }))),
);
await writeFile(path.join(appDir, "favicon.ico"), favicon);
console.log("wrote src/app/favicon.ico");
// iOS rounds the corners itself and ignores transparency.
await writeFile(path.join(appDir, "apple-icon.png"), await render(`<rect width="32" height="32" fill="${GREEN}"/>${scaled(LEAF + VEINS, 0.9)}`, 180));
console.log("wrote src/app/apple-icon.png");
