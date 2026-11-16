#!/usr/bin/env node
/**
 * Renders the animated signature card to a GIF and checks it.
 *
 *   node scripts/render.mjs <brand.json> [out.gif] [--card <card.html>] [--fps 15]
 *
 * Needs, in the folder you run from (or any parent): `npm i playwright` and `npx playwright install chromium`.
 * Needs ffmpeg on PATH. Needs the network if brand.json names Google Fonts.
 *
 * Writes the GIF plus <out>-first.png and <out>-last.png (frame 0 and the final frame) to look at, and
 * fails if the GIF is over 1 MB or the first and last frames differ.
 */
import { createRequire } from "node:module";
import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, statSync, copyFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { pathToFileURL, fileURLToPath } from "node:url";

const MAX_BYTES = 1024 * 1024;
const args = process.argv.slice(2);
const flag = (name, dflt) => {
  const i = args.indexOf(name);
  if (i < 0) return dflt;
  const v = args[i + 1];
  args.splice(i, 2);
  return v;
};
const here = path.dirname(fileURLToPath(import.meta.url));
const cardFile = path.resolve(flag("--card", path.join(here, "../assets/card.html")));
const fps = Number(flag("--fps", 15));
const [brandFile, outArg] = args;
if (!brandFile) {
  console.error("Usage: node scripts/render.mjs <brand.json> [out.gif] [--card card.html] [--fps 15]");
  process.exit(1);
}
const out = path.resolve(outArg ?? "signature.gif");

// Playwright is looked up from where you run the command, so the skill folder itself stays dependency-free.
let chromium;
try {
  ({ chromium } = createRequire(path.join(process.cwd(), "noop.js"))("playwright"));
} catch {
  console.error("Playwright not found. In this folder run:  npm i playwright  &&  npx playwright install chromium");
  process.exit(1);
}
try {
  execFileSync("ffmpeg", ["-version"], { stdio: "ignore" });
} catch {
  console.error("ffmpeg not found on PATH. Install it (macOS: brew install ffmpeg · Windows: winget install Gyan.FFmpeg · Linux: apt install ffmpeg).");
  process.exit(1);
}

const brandDir = path.dirname(path.resolve(brandFile));
const brand = JSON.parse(readFileSync(brandFile, "utf8"));
for (const k of ["name", "domain", "tagline", "colors", "story"]) {
  if (!brand[k]) throw new Error(`brand.json is missing "${k}"`);
}
// Images travel as data URLs, so the card never depends on a server or the network.
const MIME = { svg: "image/svg+xml", png: "image/png", jpg: "image/jpeg", jpeg: "image/jpeg", webp: "image/webp", gif: "image/gif", avif: "image/avif", ico: "image/x-icon" };
const dataUrl = (file) => {
  if (/^data:/.test(file)) return file;
  const p = path.resolve(brandDir, file);
  const mime = MIME[path.extname(p).slice(1).toLowerCase()];
  if (!mime) throw new Error(`Unsupported image type: ${p} (use svg, png, jpg, webp, gif, avif or ico)`);
  return `data:${mime};base64,${readFileSync(p).toString("base64")}`;
};
if (brand.logo) brand.logo = dataUrl(brand.logo);
if (brand.wordmark) brand.wordmark = dataUrl(brand.wordmark);
if (brand.story.type === "showcase") {
  if (!brand.story.items?.length) throw new Error("A showcase story needs story.items: [{ image, title, text }]");
  for (const it of brand.story.items) it.image = dataUrl(it.image);
}

const frames = mkdtempSync(path.join(tmpdir(), "sig-frames-"));
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 600, height: 170 }, deviceScaleFactor: 2 });
const errors = [];
page.on("pageerror", (e) => errors.push(e.message));
await page.goto(pathToFileURL(cardFile).href);
const overflow = await page.evaluate((b) => window.setup(b), brand);
if (errors.length) throw new Error("card.html error: " + errors.join("; "));
const loop = await page.evaluate(() => window.LOOP);
const count = Math.round(loop * fps);
const card = page.locator("#card");
for (let i = 0; i < count; i++) {
  await page.evaluate((t) => window.render(t), i / fps);
  await card.screenshot({ path: path.join(frames, `${String(i).padStart(4, "0")}.png`) });
}
// The frame at t = LOOP must match t = 0, so the loop has no jump.
await page.evaluate((t) => window.render(t), loop);
const lastPng = out.replace(/\.gif$/i, "") + "-last.png";
await card.screenshot({ path: lastPng });
await browser.close();
if (errors.length) throw new Error("card.html error: " + errors.join("; "));

const firstPng = out.replace(/\.gif$/i, "") + "-first.png";
copyFileSync(path.join(frames, "0000.png"), firstPng);

// One palette for the whole loop (no colour flicker); diff-only frames keep the file small.
execFileSync("ffmpeg", [
  "-y", "-loglevel", "error", "-framerate", String(fps), "-i", path.join(frames, "%04d.png"),
  "-vf", "split[a][b];[a]palettegen=max_colors=128:stats_mode=full[p];[b][p]paletteuse=dither=sierra2_4a:diff_mode=rectangle",
  "-loop", "0", out,
]);
rmSync(frames, { recursive: true });

const size = statSync(out).size;
const same = Buffer.compare(readFileSync(firstPng), readFileSync(lastPng)) === 0;
console.log(`${out}: ${count} frames at ${fps} fps, 1200x340, ${(size / 1024).toFixed(0)} KB`);
console.log(`first frame: ${firstPng}`);
let ok = true;
if (size > MAX_BYTES) {
  ok = false;
  console.error(`FAIL over 1 MB. Showcase: use fewer photos (2 is safest) or calmer ones. Other scenes: remove whatever changes a large area every frame. Last resort: --fps 12.`);
}
if (overflow?.length) {
  ok = false;
  console.error(`FAIL text runs off the edge: ${overflow.join(", ")}. Shorten it (or, for the question, keep it under about 32 characters).`);
}
if (!same) {
  ok = false;
  console.error(`FAIL the last frame differs from the first (${lastPng}). The story must end exactly on the brand card.`);
}
if (ok) {
  console.log(`PASS size under 1 MB`);
  console.log(`PASS no text runs off the edges`);
  console.log(`PASS the loop ends on the first frame`);
  console.log(`Now look at ${firstPng} and a few mid-loop frames yourself: these checks can't see a blurry logo, poor contrast or a bad crop.`);
}
process.exit(ok ? 0 : 1);
