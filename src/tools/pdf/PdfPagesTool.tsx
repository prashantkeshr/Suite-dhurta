import { useCallback, useMemo, useState } from 'react';
import { clsx } from 'clsx';
import { Download, Play, RotateCw, RotateCcw, FileText, X } from 'lucide-react';
import type { ToolDefinition } from '@/types/tool';
import { acceptAttribute, formatLabel } from '@/tools/registry';
import { useStore } from '@/storage/store';
import { saveMany, type OutputFile } from '@/conversion/download';
import { outputName } from '@/utils/filename';
import { formatBytes } from '@/utils/format';
import { t } from '@/i18n';
import { Button, Card, Progress, Segmented } from '@/components/ui/primitives';
import { ErrorState } from '@/components/ui/states';
import { FileDropzone } from '@/components/files/FileDropzone';
import { useSaver } from '@/components/tools/common';
import { loadPdf, extractPages, rotatePages, deletePages, readInfo } from './engine';
import { parsePageRanges, formatPageList, chunkPages } from './ranges';
import { useJob } from './useJob';
import { PdfThumbnail } from './PdfThumbnail';
import { usePdfPreview } from './usePdfPreview';
import { useInitialFiles } from '@/hooks/useInitialFiles';

type Mode = 'split' | 'rotate' | 'delete';
const MODE: Record<string, Mode> = { 'pdf-split': 'split', 'pdf-rotate': 'rotate', 'pdf-delete-pages': 'delete' };

interface Loaded {
  file: File;
  pages: { width: number; height: number; rotation: number }[];
}

export default function PdfPagesTool({ tool, initialFiles }: { tool: ToolDefinition; initialFiles?: File[] }) {
  const mode = MODE[tool.id] ?? 'split';
  const [pdf, setPdf] = useState<Loaded | null>(null);
  const [loadError, setLoadError] = useState<unknown>(null);
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [rangeText, setRangeText] = useState('');
  const [rangeError, setRangeError] = useState<string | null>(null);
  const [splitMode, setSplitMode] = useState<'extract' | 'each' | 'chunks'>('extract');
  const [chunkSize, setChunkSize] = useState(2);
  const [angle, setAngle] = useState<90 | 180 | 270>(90);
  const job = useJob<OutputFile[]>();
  const save = useSaver();
  const useDialog = useStore((s) => s.settings.useSaveDialog);
  const suffix = useStore((s) => s.settings.filenameSuffix);
  const addHistory = useStore((s) => s.addHistory);

  const open = useCallback(
    async (files: File[]) => {
      setLoadError(null);
      job.reset();
      try {
        const { doc, file } = await loadPdf(files[0]);
        const info = readInfo(doc);
        setPdf({ file, pages: info.pages });
        // Rotate defaults to all pages; split/delete start with nothing selected.
        const all = new Set(info.pages.map((_, i) => i));
        setSelected(mode === 'rotate' ? all : new Set());
        setRangeText(mode === 'rotate' ? 'all' : '');
      } catch (err) {
        setPdf(null);
        setLoadError(err);
      }
    },
    [mode, job.reset],
  );

  useInitialFiles(initialFiles, open);

  const { doc: preview } = usePdfPreview(pdf?.file);
  const count = pdf?.pages.length ?? 0;
  const sortedSelection = useMemo(() => [...selected].sort((a, b) => a - b), [selected]);

  const toggle = (i: number) => {
    const next = new Set(selected);
    if (next.has(i)) next.delete(i);
    else next.add(i);
    setSelected(next);
    setRangeText(next.size === count ? 'all' : formatPageList([...next]));
    setRangeError(null);
    job.reset();
  };

  const applyRange = () => {
    if (!pdf) return;
    if (!rangeText.trim()) {
      setSelected(new Set());
      setRangeError(null);
      return;
    }
    try {
      setSelected(new Set(parsePageRanges(rangeText, count)));
      setRangeError(null);
    } catch (err) {
      setRangeError((err as Error).message);
    }
  };

  const needsSelection = !(mode === 'split' && splitMode !== 'extract');
  const canRun = !!pdf && (!needsSelection || selected.size > 0) && !rangeError && !(mode === 'delete' && selected.size >= count);

  const execute = async () => {
    if (!pdf) return;
    const base = pdf.file.name;
    const r = await job.run(async (signal, report) => {
      report(null, 'Reading PDF…');
      // Reload for every run: rotate/delete modify the document in place.
      const { doc } = await loadPdf(pdf.file);
      if (mode === 'rotate') {
        report(null, 'Rotating pages…');
        return [{ name: outputName(base, suffix ? 'rotated' : '', 'pdf'), blob: await rotatePages(doc, sortedSelection, angle) }];
      }
      if (mode === 'delete') {
        report(null, 'Removing pages…');
        return [{ name: outputName(base, suffix ? 'edited' : '', 'pdf'), blob: await deletePages(doc, sortedSelection) }];
      }
      if (splitMode === 'extract') {
        report(null, 'Extracting pages…');
        return [{ name: outputName(base, `pages-${formatPageList(sortedSelection).replace(/–/g, '-').replace(/, /g, '_').slice(0, 60)}`, 'pdf'), blob: await extractPages(doc, sortedSelection) }];
      }
      const groups = splitMode === 'each' ? chunkPages(count, 1) : chunkPages(count, chunkSize);
      const out: OutputFile[] = [];
      for (let g = 0; g < groups.length; g++) {
        if (signal.aborted) throw new DOMException('Cancelled', 'AbortError');
        report(g / groups.length, `Creating file ${g + 1} of ${groups.length}…`);
        const label = groups[g].length === 1 ? `page-${groups[g][0] + 1}` : `pages-${groups[g][0] + 1}-${groups[g][groups[g].length - 1] + 1}`;
        out.push({ name: outputName(base, label, 'pdf'), blob: await extractPages(doc, groups[g]) });
      }
      return out;
    });
    if (r) {
      const summary = mode === 'rotate' ? `Rotated ${selected.size} pages by ${angle}°` : mode === 'delete' ? `Deleted ${selected.size} pages` : `Split into ${r.length} file${r.length > 1 ? 's' : ''}`;
      addHistory(tool.id, summary);
    }
  };

  const downloadResult = async () => {
    const r = job.result;
    if (!r) return;
    if (r.length === 1) await save(r[0].blob, r[0].name);
    else await saveMany(r, outputName(pdf!.file.name, 'split', 'zip'), { useDialog });
  };

  const actionLabel = mode === 'rotate' ? `Rotate ${selected.size} page${selected.size === 1 ? '' : 's'}` : mode === 'delete' ? `Delete ${selected.size} page${selected.size === 1 ? '' : 's'}` : splitMode === 'extract' ? `Extract ${selected.size} page${selected.size === 1 ? '' : 's'}` : 'Split PDF';

  return (
    <div className="space-y-4">
      {!pdf && <FileDropzone onFiles={open} accept={acceptAttribute(tool)} acceptLabel={formatLabel(tool.inputTypes)} multiple={false} />}
      {loadError != null && <ErrorState error={loadError} />}

      {pdf && (
        <div className="grid gap-4 lg:grid-cols-[1fr_300px]">
          <Card className="min-w-0 p-4">
            <div className="mb-3 flex items-center gap-2">
              <FileText size={18} className="shrink-0 text-muted" aria-hidden />
              <p className="min-w-0 flex-1 truncate text-sm font-medium">
                {pdf.file.name} <span className="font-normal text-muted">· {count} pages · {formatBytes(pdf.file.size)}</span>
              </p>
              <Button size="sm" variant="ghost" icon={<X size={14} />} onClick={() => setPdf(null)}>
                Change file
              </Button>
            </div>

            <div className="mb-3 flex flex-wrap items-end gap-2">
              <div className="min-w-[180px] flex-1">
                <label htmlFor="range" className="label">
                  Pages {mode === 'delete' ? 'to delete' : mode === 'rotate' ? 'to rotate' : 'to extract'}
                </label>
                <input
                  id="range"
                  className="input font-mono"
                  placeholder="e.g. 1-3, 5, 8-"
                  value={rangeText}
                  onChange={(e) => setRangeText(e.target.value)}
                  onBlur={applyRange}
                  onKeyDown={(e) => e.key === 'Enter' && applyRange()}
                  aria-invalid={!!rangeError}
                  aria-describedby="range-help"
                  disabled={!needsSelection}
                />
              </div>
              <Button size="sm" onClick={() => (setSelected(new Set(pdf.pages.map((_, i) => i))), setRangeText('all'), setRangeError(null))} disabled={!needsSelection}>
                All
              </Button>
              <Button size="sm" onClick={() => (setSelected(new Set()), setRangeText(''), setRangeError(null))} disabled={!needsSelection}>
                None
              </Button>
            </div>
            <p id="range-help" className={clsx('mb-3 text-xs', rangeError ? 'text-error' : 'text-muted')}>
              {rangeError ?? 'Type ranges or click pages below.'}
            </p>

            <div role="group" aria-label="Pages" className="grid grid-cols-3 gap-2 sm:grid-cols-4 xl:grid-cols-6">
              {pdf.pages.map((p, i) => {
                const rot = (p.rotation + (mode === 'rotate' && selected.has(i) ? angle : 0)) % 180 !== 0;
                const w = rot ? p.height : p.width;
                const h = rot ? p.width : p.height;
                const on = selected.has(i);
                return (
                  <button
                    key={i}
                    onClick={() => toggle(i)}
                    disabled={!needsSelection}
                    aria-pressed={on}
                    aria-label={`Page ${i + 1}`}
                    className={clsx(
                      'relative flex flex-col items-center gap-1 rounded-md border p-1.5 transition-colors disabled:cursor-default',
                      on ? (mode === 'delete' ? 'border-error bg-error/10' : 'border-accent bg-accent/10') : 'border-line hover:border-accent/50',
                    )}
                  >
                    {preview ? (
                      <>
                        <PdfThumbnail doc={preview} index={i} rotate={mode === 'rotate' && on ? angle : 0} className={clsx('w-full', mode === 'delete' && on && 'opacity-40')} />
                        <span className={clsx('text-xs tabular-nums', on ? (mode === 'delete' ? 'text-error line-through' : 'text-accent') : 'text-muted')}>{i + 1}</span>
                      </>
                    ) : (
                    <span
                      className={clsx('flex items-center justify-center rounded-sm border bg-surface text-xs font-medium tabular-nums', on ? (mode === 'delete' ? 'border-error text-error line-through' : 'border-accent text-accent') : 'border-line text-muted')}
                      style={w >= h ? { width: '100%', aspectRatio: `${w} / ${h}` } : { height: '100%', aspectRatio: `${w} / ${h}` }}
                    >
                      {i + 1}
                    </span>
                    )}
                  </button>
                );
              })}
            </div>
          </Card>

          <Card className="h-fit space-y-4 p-4 lg:sticky lg:top-20">
            {mode === 'split' && (
              <>
                <Segmented
                  label="Split method"
                  value={splitMode}
                  onChange={(v) => (setSplitMode(v), job.reset())}
                  options={[
                    { value: 'extract', label: 'Selected pages' },
                    { value: 'each', label: 'Every page' },
                    { value: 'chunks', label: 'Every N pages' },
                  ]}
                />
                {splitMode === 'chunks' && (
                  <div>
                    <label htmlFor="n" className="label">
                      Pages per file
                    </label>
                    <input id="n" type="number" min={1} max={count} className="input" value={chunkSize} onChange={(e) => setChunkSize(Math.max(1, Number(e.target.value) || 1))} />
                  </div>
                )}
                <p className="text-xs text-muted">
                  {splitMode === 'extract'
                    ? 'Creates one PDF with the selected pages, in the order listed.'
                    : `Creates ${splitMode === 'each' ? count : Math.ceil(count / chunkSize)} PDFs, downloaded together as a ZIP.`}
                </p>
              </>
            )}
            {mode === 'rotate' && (
              <div>
                <span className="label">Rotate by</span>
                <div className="grid grid-cols-3 gap-1">
                  {([90, 180, 270] as const).map((a) => (
                    <Button key={a} size="sm" variant={angle === a ? 'primary' : 'secondary'} aria-pressed={angle === a} onClick={() => (setAngle(a), job.reset())} icon={a === 270 ? <RotateCcw size={14} /> : <RotateCw size={14} />}>
                      {a === 270 ? '90° left' : a === 90 ? '90° right' : '180°'}
                    </Button>
                  ))}
                </div>
              </div>
            )}
            {mode === 'delete' && selected.size >= count && count > 0 && <p className="text-xs text-error">You cannot delete every page.</p>}

            {job.running ? (
              <div className="space-y-2">
                <Progress value={job.progress} label="Processing PDF" />
                <p className="text-xs text-muted">{job.step ?? t('queue.processing')}</p>
                <Button onClick={job.cancel} className="w-full justify-center">
                  {t('action.cancel')}
                </Button>
              </div>
            ) : (
              <Button variant={mode === 'delete' ? 'danger' : 'primary'} size="lg" className="w-full justify-center" disabled={!canRun} onClick={execute} icon={<Play size={16} />}>
                {actionLabel}
              </Button>
            )}

            {job.result && (
              <div className="space-y-2 rounded-md border border-success/30 bg-success/5 p-3 text-sm">
                <p className="font-medium">
                  {job.result.length === 1 ? `Ready: ${formatBytes(job.result[0].blob.size)}` : `${job.result.length} files ready`}
                </p>
                <Button variant="primary" className="w-full justify-center" icon={<Download size={16} />} onClick={downloadResult}>
                  {job.result.length === 1 ? t('action.download') : t('action.downloadAll')}
                </Button>
                <p className="text-xs text-muted">Your original file is unchanged.</p>
              </div>
            )}
          </Card>
        </div>
      )}

      {job.error != null && <ErrorState error={job.error} onRetry={execute} />}
    </div>
  );
}
