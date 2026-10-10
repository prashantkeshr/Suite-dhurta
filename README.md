<p><img src="public/brand/logo-light.png" alt="Dhurta Suite" height="64"></p>

# Dhurta Suite

A privacy-first productivity suite that runs entirely in the browser. Images, PDFs, text, data, developer utilities, calculators and file tools — processed locally, with no backend, no database, no account and no uploads.

- **Static site.** Deploys to GitHub Pages, Cloudflare Pages, Netlify or any static host.
- **Local processing.** Files are read into the tab, processed with JavaScript / Web Workers, and handed back as downloads.
- **Honest.** Tools that can't yet be done reliably in a browser (PDF → Word, OCR…) are listed as **Coming soon** with a reason and no upload form. A unit test enforces this.

## Status

Phases 1 (foundation), 2 (images), 3 (PDF core), 4 (text & data), 5 (productivity), 6 (installable app, offline) and the first part of 7 (advanced documents) are complete, plus working tools pulled forward from later phases — 96 tools in total:

| Area | Available now | Coming soon |
|---|---|---|
| Images | Resize, convert (JPEG/PNG/WebP + fixed-pair converters), compress, rotate, flip, crop, watermark (text in any script or logo), favicon/ICO generator, SVG→PNG (beta), info, Base64 ↔ image, **HEIC → JPG/PNG/WebP** (libheif WebAssembly, beta) — batch + ZIP. **Photopea** full image editor (clearly labelled external service, loads only after consent; fit / full-window / fullscreen; open files in and save PNG/JPG/WebP/PSD back via Photopea’s postMessage API) | Background removal |
| PDF | Page thumbnails (pdf.js), merge, split/extract, rotate, delete, organize (reorder/duplicate/blank pages), watermark (incl. Hindi), page numbers, visual signature, PDF → image, PDF → text, metadata view/strip, image → PDF, **compress** (strong: pages → images with a KB/MB target; light: keeps text), **compare two PDFs** (page-by-page text diff) | Password protect, OCR, Office conversions |
| Text & documents | Word/character counter (Hindi-aware), case converter, line cleaner, find & replace, slug, lorem ipsum, text diff (lines/words/chars, .patch export), Markdown editor (sanitised preview, HTML export), Markdown → PDF and Text → PDF (browser print engine, Hindi supported) | Rich text editor |
| Developer | **Code Editor** — Monaco, the editor from VS Code, bundled locally: tabs, IntelliSense (JS/TS, JSON, HTML, CSS), 80+ languages, format, open a folder and save back to disk (Chrome/Edge); vscode.dev cannot be embedded (it sends `frame-ancestors 'none'`), so it opens in a new tab. JSON format/validate/minify + tree view, YAML ↔ JSON, XML format/validate/minify, code formatter (Prettier: HTML/CSS/SCSS/Less/JS/TS/JSON/Markdown/YAML/GraphQL; SQL with dialects), Base64, URL, HTML entities, URL/UTM parser, JWT decoder, regex tester, colour + contrast, HTTP header parser + security checklist, user-agent info (beta), CSS gradient and box-shadow generators | Code minifier |
| Security | **File encryption** (AES-256-GCM, PBKDF2 600k), **password strength checker** (offline estimate), **2FA/TOTP code generator** (RFC 6238, QR import), Password, **passphrase** (EFF 7,776-word list, unbiased crypto random, honest entropy), UUID, random token, SHA-1/256/384/512 (text + files), **QR code reader** (image or camera; shows the real destination with warnings for http, shorteners, punycode look-alikes, `user@host` tricks; UPI and Wi-Fi codes decoded; links never auto-open) | — |
| Generators | **Branded QR code generator** — link, text, Wi-Fi, UPI payment, contact (vCard), email, SMS, phone; logo in the centre (modules cleared, ECC H), square/rounded/dots/fluid dots, square/rounded/circle/leaf corners, colours, gradient, transparent background, caption frame, “save as my brand style”; every design is re-decoded (scan check) with contrast/inversion/logo-size warnings; SVG and PNG up to 4096 px. **Barcode generator** — Code 128, EAN-13/8, UPC-A, Code 39, ITF-14, Codabar with GS1 check digits; SVG/PNG. | — |
| Data | **PowerPoint inspector** (slide titles, text and notes, hidden slides, extract all media, properties), CSV ↔ JSON, CSV viewer/editor (virtualised grid, sort, filter, edit, undo, dedupe, split/merge columns, formula-safe export), spreadsheet viewer (XLSX/XLS/ODS → CSV/JSON, workbook properties) | Excel → PDF |
| Calculators | **time calculator** (add/subtract durations, hours worked with breaks and night shifts + CSV, clock + duration, decimal hours), **time zone converter** (DST-aware, any IANA zone), Percentage/discount/profit, GST (2025 slabs), EMI + schedule, simple & compound interest (FD/RD, monthly deposits, EAR, yearly table), scientific (safe parser: trig in deg/rad, logs, roots, factorial, nCr/nPr, implicit multiplication, history), date & age (exact age, next birthday, days/working days between dates, month-end-safe add/subtract), BMI (WHO and Asian-Indian cut-offs, healthy range), unit converter (13 quantities) | — |
| Business | **GST invoice generator** (CGST/SGST or IGST, HSN, discounts, amount in words → PDF; seller details saved locally), **business calculator** (profit margin & markup, break-even, discount) | Income tax, currency (live rates) |
| Productivity | Notes (autosave, search, pin, .md/.txt export, JSON backup/restore), to-do list (due dates, priorities, overdue, filters, CSV/JSON), timer + stopwatch with laps + Pomodoro (sound, optional notification, accurate in background tabs). Saved only in this browser; synced between open tabs | Rich text editor |
| Files | **Metadata Editor** (unified — edit/remove photo EXIF incl. date taken & GPS, PNG text, PDF properties, **MP4/MOV media-created dates**, **MP3 ID3 tags**, and **Office .docx/.xlsx/.pptx created/modified dates**; media/audio not re-encoded; OS file date can't be changed from a browser), File info (magic-byte detection, SHA-256, duplicates), create ZIP, extract ZIP | — |

**Search landing pages:** 32 pages for common searches — e.g. `/compress-image-to-20kb` (real target-size compression), `/jpg-to-pdf`, `/pdf-to-jpg`, `/upi-qr-code-generator`, `/age-calculator`, `/home-loan-emi-calculator` — plus Hindi versions under `/hi/` linked with hreflang. Each runs the right tool with settings preselected and has its own steps and FAQ; defined in [src/seo/tasks.ts](src/seo/tasks.ts), with tests that block duplicate or dishonest pages.

**Share via link:** *Share File via Link* puts a note, text or small file inside the link itself (after `#`, which is never sent to any server); photos are reduced to fit (≈40 KB “chat-friendly” or ≈12 KB). Optional AES-256 password (PBKDF2). The receiver lands on `/open`, sees a preview and can download it or continue in any tool. Short links also get a QR code. Cut-off links are detected. Format and tests in [src/share/linkCodec.ts](src/share/linkCodec.ts).

**Chain tools:** every file you open and every result you make goes to **Your files** (header). After any conversion or edit, “Use in another tool” lists the tools that accept the result — e.g. resize → compress → image to PDF → merge — with no download in between. Files stay only in the tab's memory.

**App & offline:** installable (Chrome/Edge/Android; iPhone via “Add to Home Screen”), opens and works without internet. Every tool you open is saved on the device; each tool page shows **Available offline** only when all of its files are cached, otherwise a **Save for offline** button with the download size. Settings → App & offline saves all tools (≈6 MB) and keeps them updated after new releases. The installed app can open images, PDFs, CSV, JSON, ZIP and text files from the OS (“Open with”) and receives files from the Android share sheet — still processed locally.

Remaining in phase 7: OCR, PDF password protection and Office conversions — each only once its quality can be proven in a browser. See [ARCHITECTURE.md](ARCHITECTURE.md#roadmap).

## Getting started

Requires Node 18+ (developed on Node 24).

```bash
npm install
```

```bash
npm run dev
```

The dev server runs at http://localhost:5173 (or the port you pass with `-- --port`).

| Script | What it does |
|---|---|
| `npm run dev` | Vite dev server with hot reload |
| `npm test` | Unit tests (Vitest) |
| `npm run typecheck` | TypeScript, no emit |
| `npm run build` | Type-check, production build to `dist/`, then generate `sitemap.xml`, `robots.txt`, `404.html` and `_redirects` |
| `npm run preview` | Serve the production build locally |

## Deployment

`npm run build` produces a fully static `dist/` folder.

- **Netlify / Cloudflare Pages:** publish `dist/`. The generated `_redirects` sends every route to `index.html`.
- **GitHub Pages:** publish `dist/`. The generated `404.html` is a copy of `index.html`, so deep links work. For a project site under a sub-path, build with `VITE_BASE=/repo-name/ npm run build`. In the repository, **Settings → Pages → Source must be “GitHub Actions”**: with “Deploy from a branch”, GitHub also publishes the raw, unbuilt source on every push and races the real deploy.
- **Vercel:** set the output directory to `dist` and add a rewrite of `/(.*)` to `/index.html`.

Set the public URL (used for canonical links and the sitemap) in [src/app/config.ts](src/app/config.ts).

## SEO & discovery

Generated at build time from the tool registry by [scripts/postbuild.ts](scripts/postbuild.ts) (content helpers in [src/seo/seo.ts](src/seo/seo.ts)):

- **One real HTML page per route** with its own title, description, canonical, robots, Open Graph and Twitter tags, plus readable static content (heading, how-to, FAQ, formats, related tools) for crawlers and AI bots that don't run JavaScript.
- **JSON-LD structured data:** `WebApplication`, `FAQPage`, `HowTo` and `BreadcrumbList` on tools; `CollectionPage` on categories; `Organization` + `WebSite` (with site search) on the home page. The same FAQ and steps are shown on each tool page.
- **Sitemaps:** `/sitemap.xml` (index) → pages, categories, tools. Coming-soon tools and empty categories are `noindex` and left out.
- **AI discovery:** `/llms.txt` and `/llms-full.txt`; `robots.txt` explicitly allows AI crawlers (GPTBot, OAI-SearchBot, ClaudeBot, PerplexityBot, Google-Extended…).
- **IndexNow:** after every deploy, the `indexnow` job in [.github/workflows/deploy.yml](.github/workflows/deploy.yml) submits all sitemap URLs to Bing, Yandex, Seznam and Naver ([scripts/indexnow.mjs](scripts/indexnow.mjs)). The key lives in `APP.indexNowKey` with the matching file in `public/`.
- **Feed:** `/feed.xml` (Atom) lists every working tool, linked from each page's `<head>`, for feed readers and aggregators.
- **Organisation:** the `Organization` data points to the parent site `APP.orgUrl` (https://dhurta.org) with `APP.sameAs` profiles, so search engines and AI assistants connect the suite to Dhurta.Org.
- Share image `public/og.jpg` (1200 × 630) and PNG icons; `site.webmanifest` (with install shortcuts to popular tools).

The live domain is **https://suite.dhurta.org** (set in `APP.siteUrl` and `public/CNAME`). It was previously `suite.dhurta.com`, which no longer serves the site.

**One-time manual steps (Google doesn't accept automatic pings):**

1. Google Search Console → add property `https://suite.dhurta.org` → verify (DNS TXT record at your domain provider, or paste the meta-tag code into `APP.verification.google` in [src/app/config.ts](src/app/config.ts) and push).
2. Search Console → Sitemaps → submit `sitemap.xml`. Optionally use URL Inspection → *Request indexing* for the home page and top tools.
3. Bing Webmaster Tools → *Import from Google Search Console* (or verify with `APP.verification.bing`) → submit `sitemap.xml`. Bing also powers ChatGPT search and Copilot.

## Brand assets

The source logo files live in [logo/](logo/). Running `node scripts/brand.mjs` builds every derived asset into `public/` from them: `favicon.ico` (16/32/48), `favicon-16/32.png`, the PWA icons `icon-192/512.png` and `icon-maskable-192/512.png`, the Apple touch icon `icon-180.png`, the social card `og.jpg` (1200×630), and the light/dark logo, badge and mark images in `public/brand/`. The UI shows these through `<Brand kind="logo" | "badge" | "mark">` in [src/components/brand/Brand.tsx](src/components/brand/Brand.tsx), which swaps between the light and dark versions with the theme. Run the script again after changing anything in `logo/`.

## Renaming the product

The name, tagline, organisation and site URL live only in [src/app/config.ts](src/app/config.ts) (plus the static `<title>` in `index.html`, which is replaced at runtime). UI strings live in [src/i18n/en.ts](src/i18n/en.ts).

## Adding a tool

1. Add a definition to the right file in `src/tools/registry/`. Start it as `planned({... reason })` if it is not ready.
2. Implement a component in `src/tools/<area>/` that receives `{ tool, initialFiles }`. Put pure logic in a separate `logic.ts` and test it.
3. Register a lazy loader in [src/tools/loaders.ts](src/tools/loaders.ts) and change the status to `available` (or `beta` / `limited`).
4. `npm test` — the registry tests fail if a usable tool has no loader, a planned tool has one, an icon is missing, or a related tool id is wrong.

Navigation, search, category pages, file-type suggestions, related tools, the sitemap and the Coming Soon page all come from the registry automatically. Details in [CONTRIBUTING.md](CONTRIBUTING.md).

## Browser support

Current Chrome, Edge, Firefox, Safari and Opera. Features are detected, never guessed from the user agent; the **Diagnostics** page shows what the current browser supports. Where an API is missing the app falls back (for example, normal downloads instead of the native save dialog, main-thread image processing instead of OffscreenCanvas workers).

## Privacy

No analytics, no tracking, no server calls with user data. Settings, favorites and a short activity history are stored in IndexedDB on the device and can be cleared from Settings. See the in-app Privacy page for the full statement.

## Documentation

- [ARCHITECTURE.md](ARCHITECTURE.md) — layers, registry, workers, storage, capability detection, error handling, testing, performance, security.
- [CONTRIBUTING.md](CONTRIBUTING.md) — coding rules, the "no fake functionality" policy, and the tool checklist.
