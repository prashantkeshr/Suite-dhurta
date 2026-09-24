# Dhurta Suite

A privacy-first productivity suite that runs entirely in the browser. Images, PDFs, text, data, developer utilities, calculators and file tools — processed locally, with no backend, no database, no account and no uploads.

- **Static site.** Deploys to GitHub Pages, Cloudflare Pages, Netlify or any static host.
- **Local processing.** Files are read into the tab, processed with JavaScript / Web Workers, and handed back as downloads.
- **Honest.** Tools that can't yet be done reliably in a browser (PDF → Word, OCR…) are listed as **Coming soon** with a reason and no upload form. A unit test enforces this.

## Status

Phases 1 (foundation), 2 (images), 3 (PDF core) and 4 (text & data) are complete, plus working tools pulled forward from later phases — 71 tools in total:

| Area | Available now | Coming soon |
|---|---|---|
| Images | Resize, convert (JPEG/PNG/WebP + fixed-pair converters), compress, rotate, flip, crop, watermark (text in any script or logo), favicon/ICO generator, SVG→PNG (beta), info, Base64 ↔ image — batch + ZIP. **Photopea** full image editor (clearly labelled external service, loads only after consent; fit / full-window / fullscreen; open files in and save PNG/JPG/WebP/PSD back via Photopea’s postMessage API) | HEIC, background removal |
| PDF | Page thumbnails (pdf.js), merge, split/extract, rotate, delete, organize (reorder/duplicate/blank pages), watermark (incl. Hindi), page numbers, visual signature, PDF → image, PDF → text, metadata view/strip, image → PDF | Compress, password protect, compare, OCR, Office conversions |
| Text & documents | Word/character counter (Hindi-aware), case converter, line cleaner, find & replace, slug, lorem ipsum, text diff (lines/words/chars, .patch export), Markdown editor (sanitised preview, HTML export), Markdown → PDF and Text → PDF (browser print engine, Hindi supported) | Rich text editor |
| Developer | JSON format/validate/minify + tree view, YAML ↔ JSON, XML format/validate/minify, code formatter (Prettier: HTML/CSS/SCSS/Less/JS/TS/JSON/Markdown/YAML/GraphQL; SQL with dialects), Base64, URL, HTML entities, URL/UTM parser, JWT decoder, regex tester, colour + contrast, HTTP header parser + security checklist, user-agent info (beta), CSS gradient and box-shadow generators | Code minifier |
| Security | Password, UUID, random token, SHA-1/256/384/512 (text + files) | Passphrase, QR |
| Data | CSV ↔ JSON, CSV viewer/editor (virtualised grid, sort, filter, edit, undo, dedupe, split/merge columns, formula-safe export), spreadsheet viewer (XLSX/XLS/ODS → CSV/JSON, workbook properties) | Excel → PDF |
| Calculators | Percentage/discount/profit, GST (2025 slabs), EMI + schedule, unit converter (13 quantities) | Scientific, interest, date/age, BMI |
| Files | File info (magic-byte detection, SHA-256, duplicates), create ZIP, extract ZIP | — |

Next phases: productivity tools (5), PWA/offline (6). See [ARCHITECTURE.md](ARCHITECTURE.md#roadmap).

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
- **GitHub Pages:** publish `dist/`. The generated `404.html` is a copy of `index.html`, so deep links work. For a project site under a sub-path, build with `VITE_BASE=/repo-name/ npm run build`.
- **Vercel:** set the output directory to `dist` and add a rewrite of `/(.*)` to `/index.html`.

Set the public URL (used for canonical links and the sitemap) in [src/app/config.ts](src/app/config.ts).

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
