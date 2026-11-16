#!/usr/bin/env node
/**
 * Builds the self-contained "make your signature" page from brand.json.
 *
 *   node scripts/build-page.mjs <brand.json> [out.html]
 *
 * The page's copied signature points at brand.gifUrl, the GIF's absolute address on the live site.
 * Open the output locally with ?preview=<local gif path or URL> to see the animation before it's deployed;
 * the copied HTML still uses gifUrl.
 */
import { readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const [brandFile, outArg] = process.argv.slice(2);
if (!brandFile) {
  console.error("Usage: node scripts/build-page.mjs <brand.json> [out.html]");
  process.exit(1);
}
const here = path.dirname(fileURLToPath(import.meta.url));
const brand = JSON.parse(readFileSync(brandFile, "utf8"));
for (const k of ["name", "domain", "tagline", "siteUrl", "gifUrl", "colors"]) {
  if (!brand[k]) throw new Error(`brand.json is missing "${k}"`);
}
if (!/^https:\/\//.test(brand.gifUrl)) throw new Error(`gifUrl must be an absolute https:// address (got ${brand.gifUrl}): mail apps can't load anything else`);
const c = brand.colors;
const page = {
  name: brand.name,
  domain: brand.domain,
  tagline: brand.tagline,
  siteUrl: brand.siteUrl,
  gifUrl: brand.gifUrl,
  email: brand.email ?? "",
  // Second line and link colours must read on white and on dark inboxes; brand.json can set them, else muted defaults.
  subtle: brand.signature?.subtle ?? c.subtle ?? "#8a8a8a",
  link: brand.signature?.link ?? c.link ?? c.accent,
  colors: { bg: c.bg, text: c.text },
};
const template = readFileSync(path.join(here, "../assets/signature-page.html"), "utf8");
if (!template.includes("/*BRAND*/ null")) throw new Error("signature-page.html lost its /*BRAND*/ placeholder");
const html = template.replace("/*BRAND*/ null", JSON.stringify(page).replace(/</g, "\\u003c")); // no "</script>" in brand text can end the script early
const out = path.resolve(outArg ?? "email-signature.html");
writeFileSync(out, html);
console.log(`${out} (copies point at ${brand.gifUrl})`);
