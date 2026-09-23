import { useCallback, useEffect, useMemo, useState } from 'react';
import { Download, Play, RotateCcw, RotateCw, FlipHorizontal2, FlipVertical2, X, Eye, AlertTriangle } from 'lucide-react';
import { clsx } from 'clsx';
import type { ToolDefinition } from '@/types/tool';
import { acceptAttribute, formatLabel } from '@/tools/registry';
import { detectFile } from '@/filesystem/detect';
import { useQueue } from '@/hooks/useQueue';
import { useObjectUrl } from '@/hooks/useObjectUrl';
import { useStore } from '@/storage/store';
import { canEncode } from '@/capabilities/detect';
import { saveMany, type OutputFile } from '@/conversion/download';
import { outputName } from '@/utils/filename';
import { formatBytes, percentChange } from '@/utils/format';
import { UserError } from '@/utils/errors';
import { t } from '@/i18n';
import { Button, Card, Segmented, Select, Toggle } from '@/components/ui/primitives';
import { Dialog } from '@/components/ui/Dialog';
import { toast } from '@/components/ui/Toast';
import { FileDropzone } from '@/components/files/FileDropzone';
import { QueueList } from '@/components/files/QueueList';
import { useSaver } from '@/components/tools/common';
import { processImage } from './engine';
import { resolveOutputMime, type ImageOps, type ImageResult, type OutputMime, type ResizeSpec, type Rotation } from './ops';
import { useInitialFiles } from '@/hooks/useInitialFiles';

type Mode = 'resize' | 'convert' | 'compress' | 'rotate' | 'flip' | 'fixed';

interface Preset {
  mode: Mode;
  fixedMime?: OutputMime;
  suffix: string;
}

const PRESETS: Record<string, Preset> = {
  'image-resizer': { mode: 'resize', suffix: 'resized' },
  'image-converter': { mode: 'convert', suffix: '' },
  'image-compressor': { mode: 'compress', suffix: 'compressed' },
  'image-rotator': { mode: 'rotate', suffix: 'rotated' },
  'image-flipper': { mode: 'flip', suffix: 'flipped' },
  'jpg-to-png': { mode: 'fixed', fixedMime: 'image/png', suffix: '' },
  'png-to-jpg': { mode: 'fixed', fixedMime: 'image/jpeg', suffix: '' },
  'jpg-to-webp': { mode: 'fixed', fixedMime: 'image/webp', suffix: '' },
  'png-to-webp': { mode: 'fixed', fixedMime: 'image/webp', suffix: '' },
  'webp-to-jpg': { mode: 'fixed', fixedMime: 'image/jpeg', suffix: '' },
  'webp-to-png': { mode: 'fixed', fixedMime: 'image/png', suffix: '' },
  'svg-to-png': { mode: 'fixed', fixedMime: 'image/png', suffix: '' },
};

const MIME_LABEL: Record<string, string> = { 'image/jpeg': 'JPEG', 'image/png': 'PNG', 'image/webp': 'WebP' };

interface Input {
  file: File;
  mime: string;
}
interface Output extends ImageResult {
  name: string;
  originalSize: number;
}

function Thumb({ blob, className }: { blob: Blob; className?: string }) {
  const url = useObjectUrl(blob);
  return (
    <div className={clsx('checker flex shrink-0 items-center justify-center overflow-hidden rounded border border-line', className ?? 'h-11 w-11')}>
      {url && <img src={url} alt="" className="max-h-full max-w-full object-contain" />}
    </div>
  );
}

export default function ImageBatchTool({ tool, initialFiles }: { tool: ToolDefinition; initialFiles?: File[] }) {
  const preset = PRESETS[tool.id] ?? PRESETS['image-converter'];
  const settings = useStore((s) => s.settings);
  const addHistory = useStore((s) => s.addHistory);
  const save = useSaver();

  const [inputs, setInputs] = useState<Input[]>([]);
  const [format, setFormat] = useState<OutputMime | 'original'>(() => {
    if (preset.fixedMime) return preset.fixedMime;
    if (preset.mode === 'compress') return settings.defaultImageFormat === 'image/png' ? 'image/webp' : settings.defaultImageFormat;
    if (preset.mode === 'convert') return settings.defaultImageFormat;
    return 'original';
  });
  const [quality, setQuality] = useState(settings.defaultQuality);
  const [resizeMode, setResizeMode] = useState<'percent' | 'dimensions'>('percent');
  const [percent, setPercent] = useState(50);
  const [width, setWidth] = useState('');
  const [height, setHeight] = useState('');
  const [keepAspect, setKeepAspect] = useState(true);
  const [maxSide, setMaxSide] = useState('');
  const [rotate, setRotate] = useState<Rotation>(90);
  const [flipH, setFlipH] = useState(true);
  const [flipV, setFlipV] = useState(false);
  const [background, setBackground] = useState('#ffffff');
  const [webpOk, setWebpOk] = useState(true);
  const [preview, setPreview] = useState<{ before: Blob; after: Output } | null>(null);
  const [zipping, setZipping] = useState(false);

  useEffect(() => {
    canEncode('image/webp').then(setWebpOk);
  }, []);

  const addFiles = useCallback(async (files: File[]) => {
    const detected = await Promise.all(files.map(detectFile));
    const ok = detected.filter((d) => d.kind === 'image' && !d.empty);
    const rejected = detected.filter((d) => d.kind !== 'image' || d.empty);
    if (rejected.length) toast.warning(`${rejected.length} file${rejected.length > 1 ? 's were' : ' was'} skipped`, rejected.map((r) => `${r.name}: ${r.empty ? 'empty file' : `${r.label} is not an image`}`).join('\n'));
    setInputs((prev) => [...prev, ...ok.map((d) => ({ file: d.file, mime: d.mime }))]);
  }, []);

  useInitialFiles(initialFiles, addFiles);

  const buildOps = useCallback(
    (inputMime: string): ImageOps => {
      let resize: ResizeSpec = { mode: 'none' };
      if (preset.mode === 'resize') {
        resize =
          resizeMode === 'percent'
            ? { mode: 'percent', percent }
            : { mode: 'dimensions', width: Number(width) || undefined, height: Number(height) || undefined, keepAspect };
      } else if (preset.mode === 'compress' && Number(maxSide) > 0) {
        resize = { mode: 'maxSide', max: Number(maxSide) };
      }
      return {
        resize,
        rotate: preset.mode === 'rotate' ? rotate : 0,
        flipH: preset.mode === 'flip' && flipH,
        flipV: preset.mode === 'flip' && flipV,
        mime: resolveOutputMime(inputMime, format),
        quality,
        background,
      };
    },
    [preset.mode, resizeMode, percent, width, height, keepAspect, maxSide, rotate, flipH, flipV, format, quality, background],
  );

  const task = useCallback(
    async (input: Input, ctx: { signal: AbortSignal; progress: (v: number | null, s?: string) => void }): Promise<Output> => {
      const ops = buildOps(input.mime);
      const result = await processImage(input.file, ops, { inputMime: input.mime, useWorker: settings.useWorkers, signal: ctx.signal, step: (s) => ctx.progress(null, s) });
      const suffix = settings.filenameSuffix ? preset.suffix : '';
      return { ...result, name: outputName(input.file.name, suffix, result.blob.type), originalSize: input.file.size };
    },
    [buildOps, settings.useWorkers, settings.filenameSuffix, preset.suffix],
  );

  const { queue, jobs } = useQueue<Input, Output>(task, 2);
  const complete = jobs.filter((j) => j.status === 'complete' && j.result);
  const busy = jobs.some((j) => j.status === 'processing' || j.status === 'queued');

  // Record one history entry per finished batch.
  useEffect(() => {
    if (!busy && complete.length > 0 && jobs.length > 0) {
      const outFormat = MIME_LABEL[complete[0].result!.blob.type] ?? 'image';
      addHistory(tool.id, `${complete.length} image${complete.length > 1 ? 's' : ''} → ${outFormat}`);
    }
  }, [busy]);

  const validation = useMemo(() => {
    if (preset.mode === 'resize' && resizeMode === 'dimensions' && !Number(width) && !Number(height)) return 'Enter a width, a height, or both.';
    if (preset.mode === 'resize' && resizeMode === 'percent' && (percent <= 0 || percent > 1000)) return 'Percentage must be between 1 and 1000.';
    if (format === 'image/webp' && !webpOk) return 'This browser cannot encode WebP. Choose JPEG or PNG.';
    return null;
  }, [preset.mode, resizeMode, width, height, percent, format, webpOk]);

  const start = () => {
    if (validation) return toast.warning(validation);
    queue.clear();
    queue.add(inputs, (i) => i.file.name);
  };

  const downloadAll = async () => {
    const files: OutputFile[] = complete.map((j) => ({ name: j.result!.name, blob: j.result!.blob }));
    setZipping(true);
    try {
      await saveMany(files, `${tool.id}-${files.length}-files.zip`, { useDialog: settings.useSaveDialog });
    } catch (err) {
      toast.error('Could not create the ZIP file', err instanceof UserError ? err.title : 'Try downloading the files one at a time.');
    } finally {
      setZipping(false);
    }
  };

  const lossy = format === 'image/jpeg' || format === 'image/webp' || (format === 'original' && inputs.some((i) => i.mime === 'image/jpeg' || i.mime === 'image/webp'));
  const outputsJpeg = format === 'image/jpeg' || (format === 'original' && inputs.some((i) => i.mime === 'image/jpeg'));
  const formatOptions = [
    ...(preset.mode === 'compress' ? [] : [{ value: 'original', label: 'Same as original' }]),
    { value: 'image/webp', label: webpOk ? 'WebP' : 'WebP (not supported here)', disabled: !webpOk },
    { value: 'image/jpeg', label: 'JPEG' },
    ...(preset.mode === 'compress' ? [] : [{ value: 'image/png', label: 'PNG (lossless)' }]),
  ];

  const hasInputs = inputs.length > 0;
  const showOptions = preset.mode !== 'fixed' || lossy || outputsJpeg;

  return (
    <div className="space-y-4">
      <FileDropzone onFiles={addFiles} accept={acceptAttribute(tool)} acceptLabel={formatLabel(tool.inputTypes)} compact={hasInputs} multiple={tool.batch} />

      {hasInputs && (
        <div className="grid gap-4 lg:grid-cols-[1fr_300px]">
          <div className="min-w-0 space-y-4 lg:order-1">
            {jobs.length === 0 ? (
              <Card className="overflow-hidden">
                <div className="flex items-center justify-between border-b border-line px-4 py-2.5">
                  <p className="text-sm font-medium">
                    {inputs.length} image{inputs.length > 1 ? 's' : ''} ready · {formatBytes(inputs.reduce((a, i) => a + i.file.size, 0))}
                  </p>
                  <Button size="sm" variant="ghost" onClick={() => setInputs([])}>
                    {t('action.clear')}
                  </Button>
                </div>
                <ul className="divide-y divide-line">
                  {inputs.map((input, i) => (
                    <li key={i} className="flex items-center gap-3 px-4 py-2.5">
                      <Thumb blob={input.file} />
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-medium" title={input.file.name}>
                          {input.file.name}
                        </p>
                        <p className="text-xs text-muted">
                          {MIME_LABEL[input.mime] ?? input.mime.replace('image/', '').toUpperCase()} · {formatBytes(input.file.size)}
                        </p>
                      </div>
                      <button onClick={() => setInputs(inputs.filter((_, j) => j !== i))} className="flex h-9 w-9 items-center justify-center rounded-md text-muted hover:bg-surface2 hover:text-fg" aria-label={`${t('action.remove')} ${input.file.name}`}>
                        <X size={15} />
                      </button>
                    </li>
                  ))}
                </ul>
              </Card>
            ) : (
              <QueueList
                queue={queue}
                jobs={jobs}
                renderThumb={(job) => (job.result ? <button onClick={() => setPreview({ before: job.input.file, after: job.result! })} aria-label={`Preview ${job.label}`} className="relative"><Thumb blob={job.result.blob} /><Eye size={12} className="absolute bottom-0.5 right-0.5 rounded bg-surface text-muted" aria-hidden /></button> : <Thumb blob={job.input.file} />)}
                renderResult={(job) => {
                  const r = job.result!;
                  const bigger = r.blob.size > r.originalSize;
                  return (
                    <span className="flex flex-wrap items-center gap-x-2">
                      <span>
                        {formatBytes(r.originalSize)} → <strong className={bigger ? 'text-warning' : 'text-fg'}>{formatBytes(r.blob.size)}</strong> ({percentChange(r.originalSize, r.blob.size)})
                      </span>
                      <span>
                        {r.width} × {r.height} · {MIME_LABEL[r.blob.type] ?? r.blob.type}
                      </span>
                      {bigger && preset.mode === 'compress' && <span className="text-warning">Larger than the original — try lower quality or WebP.</span>}
                      {r.fallbackFrom && (
                        <span className="inline-flex items-center gap-1 text-warning">
                          <AlertTriangle size={12} aria-hidden /> {MIME_LABEL[r.fallbackFrom]} not supported here; saved as {MIME_LABEL[r.blob.type] ?? r.blob.type}
                        </span>
                      )}
                    </span>
                  );
                }}
                onDownload={(job) => save(job.result!.blob, job.result!.name)}
              />
            )}
          </div>

          <aside aria-label="Options" className="lg:order-2">
            <Card className="space-y-4 p-4 lg:sticky lg:top-20">
              {preset.mode === 'resize' && (
                <>
                  <Segmented label="Resize by" value={resizeMode} onChange={setResizeMode} options={[{ value: 'percent', label: 'Percentage' }, { value: 'dimensions', label: 'Pixels' }]} />
                  {resizeMode === 'percent' ? (
                    <div>
                      <label htmlFor="pct" className="label">
                        Scale: {percent}%
                      </label>
                      <input id="pct" type="range" min={5} max={200} step={5} value={percent} onChange={(e) => setPercent(Number(e.target.value))} className="w-full accent-[rgb(var(--accent))]" />
                      <div className="mt-2 flex flex-wrap gap-1">
                        {[25, 50, 75, 150].map((p) => (
                          <Button key={p} size="sm" variant={percent === p ? 'primary' : 'secondary'} onClick={() => setPercent(p)}>
                            {p}%
                          </Button>
                        ))}
                      </div>
                    </div>
                  ) : (
                    <>
                      <div className="grid grid-cols-2 gap-2">
                        <div>
                          <label htmlFor="w" className="label">
                            Width (px)
                          </label>
                          <input id="w" className="input" inputMode="numeric" value={width} onChange={(e) => setWidth(e.target.value.replace(/\D/g, ''))} placeholder="auto" />
                        </div>
                        <div>
                          <label htmlFor="h" className="label">
                            Height (px)
                          </label>
                          <input id="h" className="input" inputMode="numeric" value={height} onChange={(e) => setHeight(e.target.value.replace(/\D/g, ''))} placeholder="auto" />
                        </div>
                      </div>
                      <Toggle checked={keepAspect} onChange={setKeepAspect} label="Keep aspect ratio" description={width && height && keepAspect ? 'Image is fitted inside the box.' : undefined} />
                    </>
                  )}
                </>
              )}

              {preset.mode === 'rotate' && (
                <div>
                  <span className="label">Rotation</span>
                  <div className="grid grid-cols-3 gap-1">
                    {([90, 180, 270] as Rotation[]).map((r) => (
                      <Button key={r} size="sm" variant={rotate === r ? 'primary' : 'secondary'} onClick={() => setRotate(r)} icon={r === 270 ? <RotateCcw size={14} /> : <RotateCw size={14} />} aria-pressed={rotate === r}>
                        {r === 270 ? '90° left' : r === 90 ? '90° right' : '180°'}
                      </Button>
                    ))}
                  </div>
                </div>
              )}

              {preset.mode === 'flip' && (
                <div className="space-y-1">
                  <Toggle checked={flipH} onChange={setFlipH} label="Flip horizontally" description="Mirror left ↔ right" />
                  <Toggle checked={flipV} onChange={setFlipV} label="Flip vertically" description="Mirror top ↕ bottom" />
                  <div className="flex gap-3 text-muted" aria-hidden>
                    <FlipHorizontal2 size={18} className={flipH ? 'text-accent' : ''} />
                    <FlipVertical2 size={18} className={flipV ? 'text-accent' : ''} />
                  </div>
                </div>
              )}

              {preset.mode === 'compress' && (
                <div>
                  <label htmlFor="max" className="label">
                    Max width/height (optional)
                  </label>
                  <input id="max" className="input" inputMode="numeric" placeholder="Keep original size" value={maxSide} onChange={(e) => setMaxSide(e.target.value.replace(/\D/g, ''))} />
                  <p className="mt-1 text-xs text-muted">Downscaling large photos saves far more space than lowering quality.</p>
                </div>
              )}

              {preset.mode !== 'fixed' && <Select label="Output format" value={format} onChange={(e) => setFormat(e.target.value as OutputMime | 'original')} options={formatOptions} />}

              {showOptions && lossy && (
                <div>
                  <label htmlFor="quality" className="label">
                    Quality: {Math.round(quality * 100)}%
                  </label>
                  <input id="quality" type="range" min={0.3} max={1} step={0.01} value={quality} onChange={(e) => setQuality(Number(e.target.value))} className="w-full accent-[rgb(var(--accent))]" />
                  <p className="mt-1 text-xs text-muted">Lower quality gives smaller files. 75–85% is usually indistinguishable from the original.</p>
                </div>
              )}

              {outputsJpeg && (
                <div>
                  <label htmlFor="bg" className="label">
                    Background for transparent areas
                  </label>
                  <div className="flex items-center gap-2">
                    <input id="bg" type="color" value={background} onChange={(e) => setBackground(e.target.value)} className="h-10 w-12 cursor-pointer rounded border border-line bg-surface" />
                    <span className="font-mono text-xs text-muted">{background}</span>
                  </div>
                  <p className="mt-1 text-xs text-muted">JPEG cannot store transparency.</p>
                </div>
              )}

              {validation && <p className="text-xs text-warning">{validation}</p>}

              <div className="flex flex-col gap-2 border-t border-line pt-4">
                <Button variant="primary" size="lg" onClick={start} disabled={busy || !!validation} loading={busy} icon={<Play size={16} />}>
                  {jobs.length ? 'Process again' : `Process ${inputs.length} image${inputs.length > 1 ? 's' : ''}`}
                </Button>
                {complete.length > 1 && (
                  <Button onClick={downloadAll} loading={zipping} disabled={busy} icon={<Download size={16} />}>
                    {t('action.downloadAll')}
                  </Button>
                )}
                {complete.length === 1 && !busy && (
                  <Button onClick={() => save(complete[0].result!.blob, complete[0].result!.name)} icon={<Download size={16} />}>
                    {t('action.download')}
                  </Button>
                )}
              </div>
            </Card>
          </aside>
        </div>
      )}

      <Dialog open={!!preview} onClose={() => setPreview(null)} title={preview?.after.name ?? ''} className="max-w-4xl">
        {preview && (
          <div className="grid gap-4 sm:grid-cols-2">
            {[
              { label: 'Original', blob: preview.before, meta: `${preview.after.sourceWidth} × ${preview.after.sourceHeight} · ${formatBytes(preview.before.size)}` },
              { label: 'Result', blob: preview.after.blob, meta: `${preview.after.width} × ${preview.after.height} · ${formatBytes(preview.after.blob.size)}` },
            ].map((x) => (
              <figure key={x.label}>
                <Thumb blob={x.blob} className="aspect-square w-full" />
                <figcaption className="mt-1.5 text-sm">
                  <span className="font-medium">{x.label}</span> <span className="text-muted">{x.meta}</span>
                </figcaption>
              </figure>
            ))}
          </div>
        )}
      </Dialog>
    </div>
  );
}
