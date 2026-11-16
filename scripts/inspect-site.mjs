#!/usr/bin/env node
/**
 * Reads a website so you can build its signature from real material, not guesses.
 *
 *   node scripts/inspect-site.mjs <https://site> [outDir] [--pages 6]
 *
 * Opens the home page and up to N internal pages (nav and footer links first) in Chromium and writes to outDir
 * (default ./site-brief):
 *   brief.json        per page: title, description, headings, main text (trimmed), CTA labels; site-wide: theme
 *                     colour, the most-used colours (backgrounds, text, buttons, links), font families, logo and
 *                     image candidates with sizes
 *   screens/*.png     a 1280x800 screenshot of each page: look at these to judge the look and feel
 *   logos/*           every logo candidate found (header SVG/IMG, apple-touch-icon, icons, og:image)
 *   images/*          the largest content images (product photos, screenshots, illustrations), for a showcase scene
 *
 * It only reads public pages, one at a time, and respects nothing beyond that: use it on the user's own site.
 */
import { createRequire } from "node:module";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";

const args = process.argv.slice(2);
const pi = args.indexOf("--pages");
const maxPages = pi >= 0 ? Number(args.splice(pi, 2)[1]) : 6;
const [start, outArg] = args;
if (!start || !/^https?:\/\//.test(start)) {
  console.error("Usage: node scripts/inspect-site.mjs <https://site> [outDir] [--pages 6]");
  process.exit(1);
}
let chromium;
try {
  ({ chromium } = createRequire(path.join(process.cwd(), "noop.js"))("playwright"));
} catch {
  console.error("Playwright not found. In this folder run:  npm i playwright  &&  npx playwright install chromium");
  process.exit(1);
}
const out = path.resolve(outArg ?? "site-brief");
for (const d of ["screens", "logos", "images"]) mkdirSync(path.join(out, d), { recursive: true });

const origin = new URL(start).origin;
/** One key per page: no #hash, no trailing slash, so "site.com" and "site.com/" aren't read twice. */
const norm = (u) => { const x = new URL(u); x.hash = ""; return x.href.replace(/\/(?=$|\?)/, ""); };
const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 }, deviceScaleFactor: 1 });
const page = await ctx.newPage();

/** Runs in the page: everything we want from one page. */
function readPage() {
  const vis = (el) => { const r = el.getBoundingClientRect(); const s = getComputedStyle(el); return r.width > 0 && r.height > 0 && s.visibility !== "hidden" && s.display !== "none" && +s.opacity > 0.05; };
  const meta = (sel) => document.querySelector(sel)?.getAttribute("content") ?? null;
  const abs = (u) => { try { return new URL(u, location.href).href; } catch { return null; } };
  const text = (el) => (el.innerText || "").replace(/\s+/g, " ").trim();

  // Colours: count computed colours by role, weighted by visible area, so the real palette rises to the top.
  const tally = { background: {}, text: {}, button: {}, link: {} };
  const add = (bucket, c, w) => { if (!c || c === "rgba(0, 0, 0, 0)" || c === "transparent") return; tally[bucket][c] = (tally[bucket][c] || 0) + w; };
  const all = [...document.querySelectorAll("body, body *")].slice(0, 4000);
  for (const el of all) {
    if (!vis(el)) continue;
    const s = getComputedStyle(el); const r = el.getBoundingClientRect(); const area = Math.min(r.width * r.height, 1280 * 800);
    add("background", s.backgroundColor, area);
    const own = [...el.childNodes].some((n) => n.nodeType === 3 && n.textContent.trim());
    if (own) add("text", s.color, (el.textContent || "").length);
    if (el.matches("button, [role=button], a[class*=btn], a[class*=button], input[type=submit]")) add("button", s.backgroundColor, 1000), add("button", s.color, 300);
    if (el.matches("a")) add("link", s.color, 1);
  }
  const top = (o, n) => Object.entries(o).sort((a, b) => b[1] - a[1]).slice(0, n).map(([c]) => c);
  const fonts = {};
  for (const el of document.querySelectorAll("h1, h2, h3, p, a, button, li")) {
    if (!vis(el)) continue;
    const f = getComputedStyle(el).fontFamily.split(",")[0].replace(/["']/g, "").trim();
    const role = /^H[1-3]$/.test(el.tagName) ? "heading" : "body";
    fonts[role] = fonts[role] || {}; fonts[role][f] = (fonts[role][f] || 0) + 1;
  }

  // Logo candidates: things in the header/nav that look like a logo, plus icons and the social image.
  const logos = [];
  const header = document.querySelector("header, [role=banner], nav") || document.body;
  for (const el of header.querySelectorAll("img, svg")) {
    if (!vis(el)) continue;
    const r = el.getBoundingClientRect();
    if (r.top > 200 || r.width < 16) continue;
    const hint = [el.getAttribute("alt"), el.getAttribute("class"), el.closest("a")?.getAttribute("aria-label"), el.closest("a")?.getAttribute("href")].join(" ");
    const score = (/logo|brand/i.test(hint) ? 3 : 0) + (el.closest("a")?.getAttribute("href") === "/" || el.closest("a")?.href === location.origin + "/" ? 2 : 0) + (r.left < 400 ? 1 : 0);
    if (el.tagName.toLowerCase() === "svg") {
      const clone = el.cloneNode(true);
      clone.setAttribute("xmlns", "http://www.w3.org/2000/svg");
      // Inline the computed fill so currentColor logos keep their colour outside the page.
      clone.setAttribute("color", getComputedStyle(el).color);
      if (!clone.getAttribute("viewBox")) clone.setAttribute("viewBox", `0 0 ${r.width} ${r.height}`);
      logos.push({ kind: "inline-svg", svg: clone.outerHTML, w: Math.round(r.width), h: Math.round(r.height), score });
    } else {
      logos.push({ kind: "img", src: abs(el.currentSrc || el.src), w: Math.round(r.width), h: Math.round(r.height), natural: [el.naturalWidth, el.naturalHeight], score });
    }
  }
  for (const l of document.querySelectorAll("link[rel*=icon], link[rel=apple-touch-icon], link[rel=mask-icon]")) logos.push({ kind: l.rel, src: abs(l.href), sizes: l.getAttribute("sizes"), score: /apple/.test(l.rel) ? 1 : 0 });
  const og = meta("meta[property='og:image']");
  if (og) logos.push({ kind: "og:image", src: abs(og), score: -1 });

  // Content images: the biggest visible ones, which are usually products, screenshots or people.
  const images = [...document.querySelectorAll("main img, section img, article img, img")]
    .filter((im) => vis(im) && im.naturalWidth >= 300 && im.naturalHeight >= 200)
    .map((im) => { const r = im.getBoundingClientRect(); return { src: abs(im.currentSrc || im.src), alt: im.alt || "", w: im.naturalWidth, h: im.naturalHeight, shown: Math.round(r.width * r.height) }; })
    .sort((a, b) => b.shown - a.shown).slice(0, 8);

  // Header/nav/footer links first, then every other link: many sites have no <header> or <nav> at all.
  const links = [...new Set([...document.querySelectorAll("header a[href], nav a[href], footer a[href]"), ...document.querySelectorAll("a[href]")]
    .map((a) => abs(a.getAttribute("href"))).filter(Boolean))];

  const main = document.querySelector("main") || document.body;
  return {
    url: location.href,
    title: document.title,
    description: meta("meta[name=description]") || meta("meta[property='og:description']"),
    siteName: meta("meta[property='og:site_name']"),
    themeColor: meta("meta[name=theme-color]"),
    headings: [...document.querySelectorAll("h1, h2, h3")].filter(vis).map(text).filter(Boolean).slice(0, 25),
    ctas: [...document.querySelectorAll("button, a[class*=btn], a[class*=button], [role=button]")].filter(vis).map(text).filter((t) => t && t.length < 40).slice(0, 15),
    text: text(main).slice(0, 3000),
    palette: { background: top(tally.background, 6), text: top(tally.text, 5), button: top(tally.button, 5), link: top(tally.link, 4) },
    fonts: Object.fromEntries(Object.entries(fonts).map(([k, v]) => [k, top(v, 3)])),
    logos,
    images,
    links,
  };
}

const seen = new Set();
const queue = [start];
const pages = [];
while (queue.length && pages.length < maxPages) {
  const url = queue.shift();
  if (seen.has(norm(url))) continue;
  seen.add(norm(url));
  try {
    const res = await page.goto(url, { waitUntil: "networkidle", timeout: 30000 }).catch(() => page.goto(url, { waitUntil: "load", timeout: 30000 }));
    if (!res || res.status() >= 400) continue;
    await page.waitForTimeout(800); // let fonts and late images settle
    const data = await page.evaluate(readPage);
    const n = pages.length;
    await page.screenshot({ path: path.join(out, "screens", `${String(n).padStart(2, "0")}.png`) });
    pages.push({ ...data, screenshot: `screens/${String(n).padStart(2, "0")}.png` });
    console.log(`read ${data.url}`);
    // Next pages: same-site links, product/feature/about/pricing first, skipping files, legal and auth pages.
    const rank = (u) => (/product|feature|solution|service|shop|collection|menu|work|portfolio|about|pricing|how/i.test(u) ? 0 : 1);
    for (const l of data.links.filter((l) => l.startsWith(origin) && !/\.(pdf|zip|jpg|png|svg|mp4)$|login|signin|signup|cart|account|privacy|terms|legal|cookie/i.test(l)).sort((a, b) => rank(a) - rank(b))) {
      if (!seen.has(norm(l))) queue.push(l);
    }
  } catch (e) {
    console.warn(`skip ${url}: ${e.message}`);
  }
}

// Download logo and image candidates so they can be looked at and used in the card.
const saved = { logos: [], images: [] };
const fetchTo = async (src, dir, i) => {
  try {
    const r = await ctx.request.get(src, { timeout: 20000 });
    if (!r.ok()) return null;
    const type = (r.headers()["content-type"] || "").split(";")[0];
    const ext = { "image/svg+xml": "svg", "image/png": "png", "image/jpeg": "jpg", "image/webp": "webp", "image/gif": "gif", "image/x-icon": "ico", "image/vnd.microsoft.icon": "ico", "image/avif": "avif" }[type];
    if (!ext) return null;
    const file = `${dir}/${String(i).padStart(2, "0")}.${ext}`;
    writeFileSync(path.join(out, file), await r.body());
    return file;
  } catch { return null; }
};
const logoSeen = new Set();
let li = 0;
for (const l of pages.flatMap((p) => p.logos).sort((a, b) => b.score - a.score)) {
  const key = l.svg ?? l.src;
  if (!key || logoSeen.has(key) || li >= 10) continue;
  logoSeen.add(key);
  let file = null;
  if (l.svg) { file = `logos/${String(li).padStart(2, "0")}.svg`; writeFileSync(path.join(out, file), l.svg); }
  else file = await fetchTo(l.src, "logos", li);
  if (file) { saved.logos.push({ file, kind: l.kind, score: l.score, w: l.w, h: l.h, natural: l.natural, sizes: l.sizes, from: l.src ?? "inline svg" }); li++; }
}
const imgSeen = new Set();
let ii = 0;
for (const im of pages.flatMap((p) => p.images).sort((a, b) => b.shown - a.shown)) {
  if (imgSeen.has(im.src) || ii >= 12) continue;
  imgSeen.add(im.src);
  const file = await fetchTo(im.src, "images", ii);
  if (file) { saved.images.push({ file, alt: im.alt, w: im.w, h: im.h, from: im.src }); ii++; }
}
// Measure every saved file, so tiny icons (often 32x32 apple-touch-icons) and banners are easy to spot.
const measure = await ctx.newPage();
for (const item of [...saved.logos, ...saved.images]) {
  const buf = readFileSync(path.join(out, item.file));
  const mime = { svg: "image/svg+xml", png: "image/png", jpg: "image/jpeg", webp: "image/webp", gif: "image/gif", ico: "image/x-icon", avif: "image/avif" }[item.file.split(".").pop()];
  const px = await measure.evaluate(async (src) => {
    const im = new Image(); im.src = src;
    try { await im.decode(); return [im.naturalWidth, im.naturalHeight]; } catch { return null; }
  }, `data:${mime};base64,${buf.toString("base64")}`);
  item.px = px;
  if (px && !item.file.endsWith(".svg") && Math.min(...px) < 128) item.note = "too small for the card";
  else if (px && px[0] / px[1] > 1.9) item.note = item.file.startsWith("logos") ? "wide: a wordmark?" : "wide banner: crop to about 4:3 before use, and check for baked-in text";
}
await browser.close();

const brief = {
  site: origin,
  readAt: new Date().toISOString(),
  pages: pages.map(({ logos, images, links, ...p }) => p),
  logos: saved.logos,
  images: saved.images,
};
writeFileSync(path.join(out, "brief.json"), JSON.stringify(brief, null, 2));
if (pages.length < 2) console.warn("Only one page was read: the site may build its links with script or block automated visits. Ask the user for product pages, or pass one as the start URL.");
console.log(`\n${pages.length} pages, ${saved.logos.length} logo candidates, ${saved.images.length} images → ${out}`);
console.log("Next: read brief.json, look at screens/*.png, logos/* and images/*.");
