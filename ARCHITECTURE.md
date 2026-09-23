# Architecture

Dhurta Suite is a single-page React application with no backend. Everything below runs in the user's browser.

```
UI layer            pages/, components/, layouts (AppShell)
  ↓
Application layer   app/ (router, config, shortcuts), hooks/, storage/store.ts
  ↓
Tool registry       tools/registry/ — the single source of truth for tools
  ↓
Capability layer    capabilities/detect.ts — feature detection
  ↓
Processing engines  tools/*/engine.ts, tools/*/logic.ts, queue/, conversion/
  ↓
Workers             workers/image.worker.ts, workers/regex.worker.ts
  ↓
Browser APIs        Canvas / OffscreenCanvas, Web Crypto, IndexedDB, File System Access, Blob
```

## Directory map

```
src/
  app/            App + router, product config, keyboard shortcut registry
  components/
    ui/           Design system: Button, Badge, Card, Progress, Tabs, Dialog, Drawer,
                  Toast, Toggle, Segmented, EmptyState, ErrorState, ComingSoon, Icon
    files/        FileDropzone, FileActions ("what can I do with this file?"),
                  QueueList, SortableFileList
    layout/       AppShell (sidebar, header, mobile bottom nav), CommandPalette
    tools/        ToolCard/ToolGrid, shared tool widgets (TextPanel, CopyButton…)
  pages/          Home, All tools/Category, ToolPage, Workspace, History,
                  Settings, Diagnostics, Privacy, About
  tools/
    registry/     Tool definitions per area + lookup helpers
    loaders.ts    Lazy import per tool id
    image/ pdf/ text/ developer/ security/ data/ calculators/ files/
  workers/        Web Worker entry points
  filesystem/     File type detection (magic bytes), drop-zone hand-off
  conversion/     Download / save / ZIP engine, clipboard
  queue/          Generic processing queue
  capabilities/   Browser feature detection
  search/         Tool search
  storage/        IndexedDB key-value store + app state (zustand)
  i18n/           UI strings
  hooks/ utils/ types/
```

## Tool registry

Every tool is a `ToolDefinition` ([src/types/tool.ts](src/types/tool.ts)):

- identity: `id`, `name`, `description`, `category`, `icon`
- honesty: `status` (`available` | `beta` | `limited` | `coming-soon` | `unavailable`), `reason`, `limitations`
- processing: `processing` (`client` | `external` + `externalService`), `offline`, `batch`, `requires` (capabilities)
- matching: `inputTypes` (MIME types, `.ext`, or `*/*`), `outputTypes`, `intents`, `keywords`, `aliases`, `actionLabel`
- discovery: `related`, `popular`, `help`

The registry drives navigation, the sidebar counts, search, category pages, intent filters on the home page, file-action suggestions, related tools, Coming Soon pages, SEO metadata and the sitemap. UI code never hard-codes a tool list.

Implementations are separate: [src/tools/loaders.ts](src/tools/loaders.ts) maps ids to `import()` calls. Several ids may share one component (all image conversions use `ImageBatchTool`, configured by a preset table keyed on `tool.id`).

**Invariant (tested):** a tool is usable if and only if it has a loader. It is impossible to ship a clickable tool without an implementation.

## File flow

```
Drop / choose files (FileDropzone)
  → size checks (warning dialog > 100 MB, refusal > 1 GB)
  → detectFile(): first 4 KB, magic bytes → MIME, kind, label, extension mismatch
  → toolsForFile(): registry tools whose inputTypes accept every file
  → user picks an action → files handed to the tool page in memory (filesystem/handoff.ts)
  → tool processes locally → preview / result → saveFile() or saveMany() (ZIP)
```

Detection trusts content over names: a PNG renamed `.jpg` is detected as PNG and flagged. ZIP containers are refined by extension (docx/xlsx/pptx/epub). Text is validated as UTF-8, so Hindi and other scripts are handled.

## Processing

### Queue

[src/queue/queue.ts](src/queue/queue.ts) is a framework-free queue with concurrency, pause/resume, cancel (via `AbortSignal`), retry, remove and clear-completed. Jobs report progress only when the task knows it; otherwise progress stays `null` and the UI shows an indeterminate bar with the current step ("Decoding image…"). The `useQueue` hook binds it to React with `useSyncExternalStore`.

### Workers

- **Image worker** — decode (`createImageBitmap`) → resize/rotate/flip on `OffscreenCanvas` → `convertToBlob`. One worker per job, so **Cancel terminates the worker** and actually stops the work. When OffscreenCanvas is missing, for SVG input, or when the worker can't decode a format, the engine falls back to the main thread with `<img>` + `<canvas>`.
- **Regex worker** — runs user regular expressions with a 1.5 s timeout, so catastrophic backtracking can't freeze the page.
- Hashing uses `crypto.subtle.digest`, which is already asynchronous and off the main thread in browsers.
- PDF work uses pdf-lib on the main thread with per-file progress. Moving it into a worker is planned together with the PDF viewer.

### Encoder capability

Browsers silently fall back to PNG when they can't encode a type. `canEncode()` checks the actual blob type once; the image tool disables unsupported formats and reports any fallback per file.

### WebAssembly

Not used yet — no current tool benefits enough to justify it. Planned candidates: OCR, HEIC decoding, better image compression (MozJPEG/OxiPNG). Each will be lazy-loaded behind its tool.

## Downloads

[src/conversion/download.ts](src/conversion/download.ts):

- `saveFile` — native save dialog (File System Access API) when enabled in Settings and supported; otherwise an `<a download>` with the object URL revoked afterwards.
- `saveMany` — one file saves directly; several are zipped with fflate (lazy-loaded). Already-compressed formats are stored, not deflated.
- Filenames: `outputName('photo.jpg', 'resized', 'image/webp')` → `photo-resized.webp`; `sanitizeFilename` removes characters invalid on Windows/macOS/Linux and reserved names but keeps Unicode; `uniqueNames` de-duplicates ZIP entries.

## Storage

No database. [src/storage/kv.ts](src/storage/kv.ts) is a tiny IndexedDB key-value store with an in-memory fallback (private windows, blocked storage). [src/storage/store.ts](src/storage/store.ts) (zustand) holds settings, favorites, recent tools, history and "remind me" flags. History stores tool ids and short summaries only — never file contents. The theme is also mirrored to `localStorage` so it can be applied before first paint.

## Capability detection

[src/capabilities/detect.ts](src/capabilities/detect.ts) checks features directly (Workers, OffscreenCanvas, WASM, File System Access, IndexedDB, Web Crypto, Service Worker, Web Share, Clipboard, BarcodeDetector, camera, Compression Streams, WebP/AVIF encoding). Tools declare `requires`; the tool page shows a **Limited browser support** banner when something is missing. User-agent strings are used only to *display* the browser name on the Diagnostics page.

## Error handling

- Tools throw `UserError(title, reasons, suggestions, cause)` for problems they understand (encrypted PDF, not a PDF, empty file, invalid Base64…).
- `describeError()` converts anything else into a friendly message (memory exhaustion, decode failures) with the raw error kept for the **Technical details** disclosure.
- `ErrorState` renders title, possible reasons, what to try, Retry, and technical details.
- Every tool renders inside an `ErrorBoundary`, so a crash in one tool never takes down the app. Failed lazy chunks (offline, redeploy) get a specific message and a reload action.

## Responsive layout

- **Mobile (< 768 px):** header with search + theme, bottom navigation (Home, Tools, Workspace, History, Settings), full-width tools, option panels stacked below content, dialogs as bottom sheets, swipeable chip rows.
- **Tablet / desktop:** sidebar with categories and counts, two-column tool layouts (work area + options inspector), sticky inspector, keyboard shortcuts.

## Accessibility

Semantic landmarks, skip link, focus moved to `<main>` on navigation, visible focus rings, labelled controls, `role="switch"`/`radiogroup`/`tablist` patterns with keyboard support, focus-trapped dialogs that restore focus, `aria-live` regions for results, progress bars with `aria-valuetext`, reduced-motion support (OS setting or in-app override).

## Theming

Colours are CSS variables (RGB channels) in [src/index.css](src/index.css) — `--background`, `--surface`, `--surface-secondary`, `--text`, `--text-muted`, `--border`, `--accent`, `--success`, `--warning`, `--error` — mapped to Tailwind colour names. Light/dark/system and four accents; no hard-coded colours in components.

## Performance

- Initial load: React + router (≈67 KB gzip) and the app shell + registry (≈41 KB gzip).
- Every page except Home and every tool is a lazy chunk. pdf-lib (≈180 KB gzip) and fflate load only with PDF/ZIP tools.
- Only the icons referenced by the registry are bundled.
- Object URLs are revoked on unmount; canvases are shrunk to 0×0 after encoding; bitmaps are closed.
- Text tools use `useDeferredValue` so typing stays responsive on long documents.

## Security

- No `dangerouslySetInnerHTML`; user content (regex matches, CSV previews, JSON) is rendered as React text nodes.
- Uploaded files are treated as untrusted: type is detected from content, ZIP entries with `../` paths are rejected (zip-slip), and nothing from a file is executed.
- SVGs are rendered via `<img>`, where scripts don't run.
- Encrypted PDFs are refused with guidance; the app never attempts to bypass encryption.
- Hashing, encoding and encryption are named accurately in the UI.
- External services (Photopea, when shipped) are labelled as external and never shown as local.

## Testing

Vitest, in Node, for everything that doesn't need a DOM:

- registry invariants (unique ids, loaders ↔ status, icons, related ids, external labelling)
- file detection (magic bytes, mismatches, Office-in-ZIP, UTF-8/Hindi, truncated multi-byte, empty files)
- search ranking
- queue (concurrency, cancel, retry, pause, "no fake progress")
- filenames, formatting, error descriptions
- tool logic: page ranges, text stats (Hindi graphemes, emoji), case/slug/clean/find-replace, CSV parsing edge cases, JSON error location, Base64/URL/entities, JWT, colours, EMI/GST/units, image sizing, EXIF orientation, secure random generators, SHA-256

Browser flows (worker image conversion, PDF merge/split, encrypted-PDF handling, hand-off from the home page, mobile layout) were verified manually in Chromium. Adding Playwright end-to-end tests is on the roadmap.

## Roadmap

| Phase | Scope |
|---|---|
| 1 Foundation | Done |
| 2 Images | Done except crop, watermark, favicon |
| 3 PDF core | Merge/split/rotate/delete/metadata/image→PDF done; viewer with thumbnails, PDF→image, reorder, watermark, sign, page numbers next |
| 4 Text & data | Core done; diff, YAML/XML/code formatters, Markdown editor, CSV grid next |
| 5 Productivity | Calculators partly done; notes, tasks, timer, QR, generators next |
| 6 PWA | Service worker, install, offline shell, per-tool offline indicators |
| 7 Advanced documents | OCR and Office conversions, only if quality is proven |
