# Contributing

## Ground rules

1. **No fake functionality.** Never add a button, progress bar or download that doesn't do real work. If a feature isn't reliable yet, register it with `planned({ reason })` so it shows as **Coming soon** with an honest explanation and no upload form.
2. **No uploads.** Tools process files in the browser. Anything that sends data elsewhere must be `processing: 'external'` with `externalService` set, and is labelled as external everywhere.
3. **Reliability before feature count.** A smaller set of tools that work on real-world files beats many that work on perfect samples.
4. **Don't break existing tools.** Reuse shared components and engines; don't fork them per tool.

## Tool checklist

Before changing a tool's status to `available`:

- [ ] Registry entry: description, `inputTypes`/`outputTypes`, `keywords`, `aliases`, `actionLabel`, `limitations`, `related`, `help` where useful
- [ ] Component in `src/tools/<area>/`, loader in `src/tools/loaders.ts`
- [ ] Pure logic in `logic.ts` (or similar) with unit tests
- [ ] Uses shared pieces: `FileDropzone`, `QueueList` or `useJob`, `ErrorState`, `useSaver`/`saveMany`, `TextPanel`, `CopyButton`
- [ ] Hand-off files via `useInitialFiles(initialFiles, add)` so it runs exactly once
- [ ] Real progress only (`progress(null, 'Step…')` when unknown)
- [ ] Cancel works (check the `AbortSignal`, or terminate the worker)
- [ ] Fallbacks answered: unsupported browser? invalid, empty, corrupted, encrypted or huge file? user cancels? library throws? out of memory?
- [ ] Errors use `UserError` with reasons and suggestions
- [ ] Tested with real files: large and tiny, transparent PNG, animated GIF, multi-page / scanned / encrypted PDFs, unusual CSV delimiters, Hindi text, Unicode and very long file names
- [ ] Works at 320 px wide and with keyboard only
- [ ] Output names follow `original-operation.ext`

## Code style

- TypeScript strict mode; no `any` unless isolated and justified.
- Components render text as React nodes — never `dangerouslySetInnerHTML` for user content. The single exception is the Markdown preview, whose HTML always passes through DOMPurify first; keep it that way.
- Colours only through the design tokens (`bg-surface`, `text-muted`, `border-line`, `text-accent`…).
- UI strings used in shared components go in `src/i18n/en.ts`. Tool-specific copy may stay in the tool for now; move it to i18n when a second language is added.
- Heavy libraries are imported only from tool modules (never from `app/`, `components/` or the registry), so they stay out of the initial bundle.
- Icons: add new registry icons to `src/components/ui/Icon.tsx`; the tests check every registry icon exists.

## Commands

```bash
npm run typecheck
```

```bash
npm test
```

```bash
npm run build
```

All three must pass before a change is merged.
