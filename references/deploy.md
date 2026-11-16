# Putting the signature on the website

Two files go live:

1. **The GIF** at exactly the address in `brand.json` → `gifUrl` (for example `/email/signature.gif`). Mail apps load it from there every time an email is opened, so it must stay at that address. To update the animation later, overwrite the file at the same path; everyone's signature then changes on its own. Mail apps and Gmail's image proxy cache images, so a change can take a day or more to show everywhere.
2. **The page** (`email-signature.html`), at any address you like, for example `/email-signature`. Share the link with your team only.

## Keep the page away from search engines and AI crawlers

The page already carries `<meta name="robots" content="noindex, nofollow, noarchive">`. Also:

- Add to `robots.txt` (create it at the site root if it doesn't exist):
  ```
  User-agent: *
  Disallow: /email-signature
  ```
  Keep the GIF's path **allowed**. Gmail fetches it through its image proxy, and blocking `/email/` gains nothing.
- Don't link the page from the site, and leave it out of `sitemap.xml` and `llms.txt`.

Know the trade-off: a well-behaved crawler that obeys `robots.txt` never fetches the page, so it never sees the noindex tag either. If someone links the page publicly, Google may list the bare address with no description. That's acceptable for a team tool. If it matters, drop the `robots.txt` line and rely on the noindex tag alone. Anyone with the link can still use the page. That's fine, because everything on it (the GIF, the brand name) is public anyway.

## By stack

These notes are starting points: hosts and builders change their menus and defaults, so confirm against the project's own setup or the host's docs.

Find which one the site uses by looking at the repo (`package.json`, `next.config.*`, `astro.config.*`, `wp-config.php`, `_config.yml`, `netlify.toml`, `vercel.json`), or by asking.

- **Plain HTML / any static host (Netlify, Vercel static, GitHub Pages, Cloudflare Pages, S3):**
  - Put the GIF at `email/signature.gif` and the page at `email-signature/index.html`, so it serves at `/email-signature`.
  - On Netlify you can also send a header: in `_headers`, add `/email-signature/*` then `  X-Robots-Tag: noindex`.
- **Next.js:**
  - Put the GIF in `public/email/signature.gif`.
  - For the page, either put the HTML in `public/email-signature/index.html` (Next serves `public/` as is; link to `/email-signature/index.html`, or add a rewrite from `/email-signature`), or port it to `app/email-signature/page.tsx` with `export const metadata = { robots: { index: false, follow: false } }`.
  - Add the Disallow line to `app/robots.ts` or `public/robots.txt`, whichever the site uses.
  - Next.js versions differ, so check the project's own docs before porting.
- **Astro / Vite / SvelteKit / Nuxt:** files in `public/` (SvelteKit: `static/`) are served as they are. Put the GIF there and the page at `public/email-signature/index.html`.
- **WordPress:**
  - Upload the GIF through Media. Use the "Original" file URL as `gifUrl`, not a resized one, because resizing can drop the animation.
  - For the page, upload `email-signature.html` with the host's file manager or SFTP to the site root as `email-signature/index.html`. A WordPress page editor usually strips the `<script>` the page needs.
  - In Settings → Reading, "Discourage search engines" applies to the whole site, so don't use it. Use the meta tag (already in the page) and the `robots.txt` line.
- **Webflow / Framer / Wix / Squarespace:**
  - Upload the GIF as an asset and use its asset URL as `gifUrl`. These builders often serve assets from their own CDN domain, which works fine in email.
  - For the page, use a custom-code / embed block on a page set to "hidden from search" (each builder has a per-page SEO toggle), or host the HTML file anywhere static.

After changing `gifUrl` (for example to a CDN address), run `build-page.mjs` again, because the page bakes the address in.

## No website you can put files on

The GIF only needs a stable public `https://` address that serves the image itself, not a preview page. Any of these work. Pick the first one the user already has:

- **Their store or CMS media library:** for example Shopify (Content → Files), WordPress (Media), Webflow or Wix assets. Upload the GIF and copy the file's direct URL.
- **A free static host:** GitHub Pages, Cloudflare Pages or Netlify. Drop `signature.gif` (and the team page, if wanted) into a tiny site.
- **Object storage:** a public Cloudflare R2 bucket or Amazon S3. R2 doesn't charge for downloads (egress), which suits an image loaded on every email open.
- **Avoid share links** from Google Drive, Dropbox or OneDrive. They usually serve a viewer page rather than the image, and can change, so the signature breaks.
- **Last resort:** paste the GIF straight into the mail app's signature editor ("insert image", "upload"). Some apps keep the animation and some don't, and the image no longer updates from one place. Send a test email before relying on it.

Whichever host you use, open the URL in a private window and confirm it shows the moving GIF on its own before building the page.

## Check after deploy

Nothing here can be checked before the files are live:

1. Open `gifUrl` in a private browser window. It should play, and the file should be under 1 MB.
2. Open the page, fill in a name, click **Copy signature**, paste into Gmail's signature box, save, and send yourself an email. Check it on the phone app too.
3. If someone uses Outlook or Apple Mail, have them do the same. Older desktop Outlook shows only the first frame, and that's expected.
4. Check `robots.txt` at the site root shows the Disallow line.
