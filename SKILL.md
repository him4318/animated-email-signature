---
name: animated-email-signature
description: Make an animated email signature for any company's website (read the site's pages, logo, colours and images, then build a small looping GIF that shows the business at work, plus a team page where each person types their name and title and copies a ready-to-paste signature), then deploy it on the company's own website. Use whenever someone wants an animated, moving, GIF or "branded" email signature, a signature banner, a signature for their whole team, or a page where staff can generate their signature, for Gmail, Outlook or Apple Mail, even if they don't say "GIF".
---

# Animated email signature

You'll make two things for the user's brand and put them on their website:

1. **A looping GIF** (1200×340, shown at 480×136, about 11 s, under 1 MB). It opens on the brand card (logo, name, tagline, domain), shows the product doing one real job, and returns to the brand card.
2. **A team page** where each person types their name, title and email, sees the signature in a light and a dark inbox, and copies it. Name and title stay as live text, so one GIF serves the whole team. The page tells search engines and AI crawlers to stay away.

The skill folder has:
- `scripts/inspect-site.mjs`: reads the website (pages, colours, fonts, logos, images, screenshots)
- `assets/card.html`: the animation, with three scenes (chat, counter, showcase), filled in from `brand.json`
- `assets/signature-page.html`: the team page
- `assets/brand.example.json`: an example brand to copy
- `scripts/render.mjs`: card → GIF, plus size and loop checks
- `scripts/build-page.mjs`: brand.json → the team page
- `references/deploy.md`: putting both on the site; read it at step 6

## Why it's built this way

Knowing these lets you make good calls when a brand doesn't fit the template:

- **Email can't run code.** Gmail, Outlook and Apple Mail strip scripts, video and CSS animation from signatures, so the only motion that survives everywhere is an animated GIF.
- **Older desktop Outlook shows only the first frame.** So frame 0 must be the finished brand card, never a blank or half-drawn frame. The loop also ends exactly on that card, so the restart has no visible jump. `render.mjs` checks both.
- **Size matters.** Big signatures get clipped or load slowly, so keep the GIF under 1 MB. A GIF stores only the pixels that change between frames, so anything that changes a large area on every frame balloons the file. In one real build, a gently pulsing glow behind the logo took the GIF from 434 KB to 1.26 MB. Prefer motion in small areas: typing text, icons, short fades. `render.mjs` fails over 1 MB.
- **Drawn at 2×, shown at fixed size.** That keeps it sharp on retina screens. The signature HTML sets `width="480" height="136"` so the mail app never shows it at the 1200 px file width.
- **The copied signature must point at the live GIF's absolute https address.** A mail app can't load a local file or a relative path. The page always copies `gifUrl`, even when it previews a local file.
- **The name has no colour of its own.** It takes the inbox's text colour, so it reads in light and dark mode. The second line and the email link use mid-tone colours that read on both.
- **The story shows only what the product really does.** A signature reaches clients and investors, so a made-up feature or number in it is a false claim in every email the team sends. Get the story from the product's own site or docs, and get the user's approval before rendering.

## Steps

### 1. Set up a working folder

Use a folder outside the website repo, so tooling doesn't end up in their site:

```bash
mkdir email-signature-work && cd email-signature-work
npm init -y
npm i playwright
npx playwright install chromium
```

Check ffmpeg with `ffmpeg -version`. To install it: on macOS `brew install ffmpeg`, on Windows `winget install Gyan.FFmpeg`, on Linux `sudo apt install ffmpeg`.

Run every command below from this folder. `brand.json`, the site brief, any cropped images and the outputs all live here, next to `node_modules`.

### 2. Read the website

```bash
node <skill folder>/scripts/inspect-site.mjs https://their-site.com site-brief --pages 6
```

It opens the home page and up to 6 more pages (products, features, about, pricing first) and writes `site-brief/`:

- `brief.json`: `pages[]` has each page's title, description, headings, main text and button labels, its `palette` (rgb colours actually used, ranked by how much of the page they cover, split into `background`, `text`, `button`, `link`) and its `fonts`. The top-level `logos` and `images` list the candidates. An empty `button` list or a `system-ui` font means the site didn't expose them: take the accent from the screenshots instead, and choose fonts by eye.
- `screens/`: a screenshot of each page
- `logos/`: every logo candidate (header SVG or image, app icons, social image)
- `images/`: the largest content images (products, dishes, projects, app screenshots, people)

`brief.json` → `logos` and `images` list each file's pixel size (`px`) and a `note` when it's too small for the card or a wide banner.

If it reads only one page, the site probably builds its links with script or blocks automated visits. Run it again with a product page as the start URL, or ask the user.

Then actually look, the way a designer would before starting:

- **Screenshots:** open the screenshots of the home page and one or two product pages. Get the feel (dark or light, playful or serious, photographic or flat UI) and which colour is the brand accent. The most-used button background is usually the accent.
- **Logos:** open the logo candidates.
  - A header SVG is usually the best source. An `apple-touch-icon` can be a clean square mark, but check its `px`: many sites serve 32×32 icons, which blur on the card. Anything noted "too small for the card" is out.
  - Check what you have. A square mark goes in `logo`. A wide wordmark goes in `wordmark` and shows on the brand card in place of the typed name.
  - Without a square logo, the card adapts. With a wordmark, it drops the left column, so the name isn't shown twice. With neither, it draws the brand's first letter in the accent colour.
  - Don't use a favicon under 64 px or a blurry crop: ask the user for a file instead.
  - Logos made for a white header can disappear on a dark card. If that happens, use a light card, ask for a light version, or edit an SVG's fill.
- **Images:** open the candidate images for a showcase scene. Skip stock-looking photos, people's faces (ask first), and anything with small text that won't read at 168×126.
  - The frame crops to fill (about 4:3). Wide hero banners usually have text and buttons baked in, and cropping them leaves slivers of letters. Crop to the subject yourself first:
    ```bash
    ffmpeg -i site-brief/images/00.png -vf "crop=900:675:500:110" crop-1.png
    ```
    Here `crop=w:h:x:y` picks a 4:3 box around the product. Then open the result to check it.
- **Text:** read the main text and headings. Get what the business really does for a customer, in their words, and any real figures it states publicly (customers served, orders delivered, years running).

If the site blocks the script (login wall, bot protection) or is thin, ask the user for the logo, colours and a sentence on what the business does.

### 3. Pick the scene and write the story, then get approval

`brand.json` → `story.type` picks one of three scenes. Choose the one that shows this business doing its job most plainly:

| Scene | Fits | Story fields |
|---|---|---|
| `chat` | software, AI agents, apps, services that answer or fix something | `question` (≤ 32 chars), three `steps` of `{ text ≤ 34, status: "ok" \| "warn" }`, `result` (≤ 28), `details` (2–3 lines ≤ 40) |
| `counter` | a real public figure: money handled, orders shipped, customers served, years running | `label` (≤ 40), `value` (number), `prefix`/`suffix` (e.g. "₹", "+", " orders"), `decimals`, `result` (≤ 28), `details` |
| `showcase` | shops, food, travel, studios, portfolios, physical products: anything better shown than told | `items`: 2–3 of `{ image: "site-brief/images/03.jpg", title ≤ 22, text ≤ 36 }`. Photos are the heaviest part of a GIF: in testing, 2 photos came to about 790 KB, 3 to about 940 KB and 4 went over 1 MB. |

A counter's figure must be one the business already states publicly (on its own site), with the user's OK. Never make one up. A showcase uses the business's own images from its site, not stock.

To add a different scene (a before/after, a map pin route, a progress bar), add an entry to `SCENES` in a copy of `card.html` and render with `--card your-card.html`. Keep the rules in "Why it's built this way".

Write `brand.json` (copy `assets/brand.example.json`; image paths are relative to `brand.json`):

- **Name, domain, URLs:** `name`, `domain`, `siteUrl`, and `gifUrl`, the absolute address the GIF will live at (for example `https://their-site.com/email/signature.gif`).
- **Text:** `tagline`, about five words saying what the business does. Optionally `email`, the placeholder email shown on the team page.
- **Images:** `logo` (a square mark, optional) and `wordmark` (optional).
- **Fonts:** Google Fonts family names. `brief.json` lists the site's own fonts.
  - If those are on Google Fonts, use them.
  - If they're proprietary or self-hosted, pick the closest Google Font by feel: a rounded sans for a rounded sans, a serif for a serif.
  - Leave `fonts` out to use system fonts.
- **Colours:** `colors`, built from the site's palette:
  - `bg`: the card background. A dark tone of the brand reads well in light inboxes and doesn't glare in dark ones. A light card also works, if the site is light.
  - `card`: a slightly different panel colour
  - `line`: borders
  - `text`, `muted` and `subtle`: text, from strongest to dimmest. They need clear contrast on `bg`.
  - `accent`: the brand colour
  - `good` and `bad`: a green and a red
  - `link`: an accent dark enough to read on a white inbox

Set `story.type` to the scene you chose; it defaults to `chat`.

Show the user the plan before rendering, and wait for their OK. Include the scene, the story lines (or chosen images with captions), and which logo you'll use.

### 4. Render and look at it

```bash
node <skill folder>/scripts/render.mjs brand.json signature.gif
```

It prints the size and PASS lines, writes `signature-last.png` (the loop's end, which must match the first frame), fails if text runs off the edge, the file is over 1 MB, or the loop doesn't end on the first frame, and writes `signature-first.png`, the frame older Outlook shows. Open that image and two or three mid-loop frames, and check:

- nothing is cut off at the right edge (long text is the usual cause)
- the logo is crisp
- the colours read
- the first frame is a finished card

To pull a frame at, say, 5 s, run `ffmpeg -ss 5 -i signature.gif -frames:v 1 frame5.png`. Fix and re-render until it passes and looks right. If it's over 1 MB, remove the large-area motion first. Lowering `--fps 12` is a last resort.

Show the user the first frame and a mid-loop frame (or the GIF itself) before going further.

### 5. Build the team page

```bash
node <skill folder>/scripts/build-page.mjs brand.json email-signature.html
```

To preview it before deploy, run `npx serve .` in the work folder and open `http://localhost:3000/email-signature?preview=signature.gif`. Leave out `.html`: `serve` redirects `.html` addresses and drops the `?preview` part, and the page then tries the not-yet-live GIF. The `preview` parameter only changes what the page shows; the copied signature still points at `gifUrl`. Try it with a long name and with characters like `<` and `&`, which must show as typed.

### 6. Deploy

Read `references/deploy.md`. It covers where the two files go for common stacks (static hosts, Next.js, Astro, WordPress, Webflow and others), where to host the GIF when the user can't put files on their site, the `robots.txt` line, and what to check once it's live. Follow the site's normal way of shipping changes: a branch and pull request if it's a git repo. Don't push or deploy without the user's go-ahead.

### 7. Hand over

Tell the user:

- **Links:** the page address to share with the team, and the GIF address.
- **Verified:** what you checked yourself, such as the render checks, the frames you looked at and the page preview.
- **Still to check after deploy:** pasting into Gmail, Outlook and Apple Mail, from the list in `deploy.md`. Nothing about real mail apps can be checked before the GIF is live, so say so plainly rather than implying it works.
- **Updating later:** edit `brand.json`, re-render, and replace the GIF at the same address. Everyone's signature updates on its own, though mail-app image caches can take a day or more.
