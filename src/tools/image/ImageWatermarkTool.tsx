import { useCallback, useRef, useState } from 'react';
import { Download, ImagePlus, Play, X } from 'lucide-react';
import type { ToolDefinition } from '@/types/tool';
import { acceptAttribute, formatLabel } from '@/tools/registry';
import { detectFile } from '@/filesystem/detect';
import { useQueue } from '@/hooks/useQueue';
import { useObjectUrl } from '@/hooks/useObjectUrl';
import { useInitialFiles } from '@/hooks/useInitialFiles';
import { useStore } from '@/storage/store';
import { saveMany } from '@/conversion/download';
import { outputName } from '@/utils/filename';
import { formatBytes } from '@/utils/format';
import { UserError, throwIfAborted } from '@/utils/errors';
import { t } from '@/i18n';
import { Button, Card, Segmented, Toggle } from '@/components/ui/primitives';
import { toast } from '@/components/ui/Toast';
import { FileDropzone } from '@/components/files/FileDropzone';
import { QueueList } from '@/components/files/QueueList';
import { useSaver } from '@/components/tools/common';
import { AnchorPicker } from '@/tools/pdf/AnchorPicker';
import type { Anchor } from '@/tools/pdf/stamp';
import { resolveOutputMime } from './ops';

interface Input {
  file: File;
  mime: string;
}
interface Output {
  blob: Blob;
  name: string;
}

interface Mark {
  kind: 'text' | 'image';
  text: string;
  color: string;
  bold: boolean;
  logo: ImageBitmap | null;
  layout: 'single' | 'tile';
  anchor: Anchor;
  size: number; // % of image width
  opacity: number; // %
  angle: number;
}

/** Draw the watermark onto ctx for an image of w×h. */
function drawMark(ctx: CanvasRenderingContext2D, w: number, h: number, m: Mark) {
  const markW = (w * m.size) / 100;
  let draw: (cx: number, cy: number) => void;
  let markH: number;
  if (m.kind === 'text') {
    const lines = m.text.split('\n');
    // Choose a font size so the longest line is markW wide.
    ctx.font = `${m.bold ? '700' : '400'} 100px system-ui, "Noto Sans", "Noto Sans Devanagari", sans-serif`;
    const widest = Math.max(...lines.map((l) => ctx.measureText(l).width), 1);
    const px = Math.max(6, (100 * markW) / widest);
    ctx.font = `${m.bold ? '700' : '400'} ${px}px system-ui, "Noto Sans", "Noto Sans Devanagari", sans-serif`;
    markH = px * 1.25 * lines.length;
    draw = (cx, cy) => {
      ctx.fillStyle = m.color;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      lines.forEach((l, i) => ctx.fillText(l, cx, cy - markH / 2 + px * 1.25 * (i + 0.5)));
    };
  } else {
    const logo = m.logo!;
    markH = (markW * logo.height) / logo.width;
    draw = (cx, cy) => ctx.drawImage(logo, cx - markW / 2, cy - markH / 2, markW, markH);
  }
  const place = (cx: number, cy: number) => {
    ctx.save();
    ctx.translate(cx, cy);
    ctx.rotate((-m.angle * Math.PI) / 180);
    ctx.translate(-cx, -cy);
    draw(cx, cy);
    ctx.restore();
  };
  ctx.globalAlpha = m.opacity / 100;
  if (m.layout === 'tile') {
    const sx = markW * 1.6;
    const sy = Math.max(markH * 3, 40);
    for (let y = sy / 2, row = 0; y < h + sy; y += sy, row++) for (let x = row % 2 ? sx / 2 : 0; x < w + sx; x += sx) place(x, y);
  } else {
    const margin = Math.round(Math.min(w, h) * 0.03);
    const [vert, horiz] = m.anchor === 'center' ? ['middle', 'center'] : m.anchor.split('-');
    const cx = horiz === 'left' ? margin + markW / 2 : horiz === 'right' ? w - margin - markW / 2 : w / 2;
    const cy = vert === 'top' ? margin + markH / 2 : vert === 'bottom' ? h - margin - markH / 2 : h / 2;
    place(cx, cy);
  }
  ctx.globalAlpha = 1;
}

function Thumb({ blob }: { blob: Blob }) {
  const url = useObjectUrl(blob);
  return <div className="checker flex h-11 w-11 shrink-0 items-center justify-center overflow-hidden rounded border border-line">{url && <img src={url} alt="" className="max-h-full max-w-full object-contain" />}</div>;
}

export default function ImageWatermarkTool({ tool, initialFiles }: { tool: ToolDefinition; initialFiles?: File[] }) {
  const [inputs, setInputs] = useState<Input[]>([]);
  const [mark, setMark] = useState<Omit<Mark, 'logo'>>({ kind: 'text', text: '© Dhurta', color: '#ffffff', bold: true, layout: 'single', anchor: 'bottom-right', size: 25, opacity: 60, angle: 0 });
  const [logoFile, setLogoFile] = useState<File | null>(null);
  const logoRef = useRef<HTMLInputElement>(null);
  const settings = useStore((s) => s.settings);
  const addHistory = useStore((s) => s.addHistory);
  const save = useSaver();

  const add = useCallback(async (files: File[]) => {
    const detected = await Promise.all(files.map(detectFile));
    const ok = detected.filter((d) => d.kind === 'image' && !d.empty && d.mime !== 'image/heic' && d.mime !== 'image/svg+xml');
    if (ok.length < detected.length) toast.warning(`${detected.length - ok.length} file(s) skipped`, 'Only JPEG, PNG, WebP, GIF and BMP images are supported.');
    setInputs((prev) => [...prev, ...ok.map((d) => ({ file: d.file, mime: d.mime }))]);
  }, []);
  useInitialFiles(initialFiles, add);

  const task = useCallback(
    async (input: Input, ctx: { signal: AbortSignal; progress: (v: number | null, s?: string) => void }): Promise<Output> => {
      ctx.progress(null, 'Decoding…');
      const bmp = await createImageBitmap(input.file);
      throwIfAborted(ctx.signal);
      let logo: ImageBitmap | null = null;
      if (mark.kind === 'image') {
        if (!logoFile) throw new UserError('Choose a logo image first.');
        logo = await createImageBitmap(logoFile);
      }
      const canvas = document.createElement('canvas');
      canvas.width = bmp.width;
      canvas.height = bmp.height;
      const c = canvas.getContext('2d')!;
      c.drawImage(bmp, 0, 0);
      ctx.progress(null, 'Adding watermark…');
      drawMark(c, bmp.width, bmp.height, { ...mark, logo });
      bmp.close();
      logo?.close();
      ctx.progress(null, 'Encoding…');
      const mime = resolveOutputMime(input.mime, 'original');
      const blob = await new Promise<Blob | null>((r) => canvas.toBlob(r, mime, settings.defaultQuality));
      canvas.width = canvas.height = 0;
      if (!blob) throw new UserError('The browser could not encode the image.');
      return { blob, name: outputName(input.file.name, settings.filenameSuffix ? 'watermarked' : '', blob.type) };
    },
    [mark, logoFile, settings.defaultQuality, settings.filenameSuffix],
  );

  const { queue, jobs } = useQueue<Input, Output>(task, 1);
  const done = jobs.filter((j) => j.status === 'complete' && j.result);
  const busy = jobs.some((j) => j.status === 'processing' || j.status === 'queued');
  const set = <K extends keyof typeof mark>(k: K, v: (typeof mark)[K]) => setMark((m) => ({ ...m, [k]: v }));
  const ready = mark.kind === 'text' ? !!mark.text.trim() : !!logoFile;

  const start = () => {
    queue.clear();
    queue.add(inputs, (i) => i.file.name);
    void queue.idle().then(() => {
      const n = queue.getJobs().filter((j) => j.status === 'complete').length;
      if (n) addHistory(tool.id, `Watermarked ${n} image${n > 1 ? 's' : ''}`);
    });
  };

  return (
    <div className="space-y-4">
      <FileDropzone onFiles={add} accept={acceptAttribute(tool)} acceptLabel={formatLabel(tool.inputTypes)} compact={inputs.length > 0} />
      {inputs.length > 0 && (
        <div className="grid gap-4 lg:grid-cols-[1fr_320px]">
          <div className="min-w-0">
            {jobs.length ? (
              <QueueList
                queue={queue}
                jobs={jobs}
                renderThumb={(j) => <Thumb blob={j.result?.blob ?? j.input.file} />}
                renderResult={(j) => <span>{formatBytes(j.result!.blob.size)}</span>}
                onDownload={(j) => save(j.result!.blob, j.result!.name)}
              />
            ) : (
              <Card className="overflow-hidden">
                <div className="flex items-center justify-between border-b border-line px-4 py-2.5 text-sm font-medium">
                  {inputs.length} image{inputs.length > 1 ? 's' : ''} ready
                  <Button size="sm" variant="ghost" onClick={() => setInputs([])}>
                    {t('action.clear')}
                  </Button>
                </div>
                <ul className="divide-y divide-line">
                  {inputs.map((i, k) => (
                    <li key={k} className="flex items-center gap-3 px-4 py-2">
                      <Thumb blob={i.file} />
                      <span className="min-w-0 flex-1 truncate text-sm">{i.file.name}</span>
                      <button onClick={() => setInputs(inputs.filter((_, j) => j !== k))} aria-label={`${t('action.remove')} ${i.file.name}`} className="flex h-9 w-9 items-center justify-center rounded text-muted hover:bg-surface2">
                        <X size={15} />
                      </button>
                    </li>
                  ))}
                </ul>
              </Card>
            )}
          </div>
          <Card className="h-fit space-y-4 p-4 lg:sticky lg:top-20">
            <Segmented label="Watermark" value={mark.kind} onChange={(v) => set('kind', v)} options={[{ value: 'text', label: 'Text' }, { value: 'image', label: 'Logo' }]} />
            {mark.kind === 'text' ? (
              <div className="space-y-2">
                <textarea aria-label="Watermark text" rows={2} className="input" value={mark.text} onChange={(e) => set('text', e.target.value)} />
                <div className="flex items-center gap-3">
                  <input type="color" aria-label="Text colour" value={mark.color} onChange={(e) => set('color', e.target.value)} className="h-9 w-12 cursor-pointer rounded border border-line" />
                  <Toggle checked={mark.bold} onChange={(v) => set('bold', v)} label="Bold" />
                </div>
              </div>
            ) : (
              <div>
                <Button icon={<ImagePlus size={16} />} onClick={() => logoRef.current?.click()}>
                  {logoFile ? 'Change logo' : 'Choose logo'}
                </Button>
                {logoFile && <p className="mt-1 truncate text-xs text-muted">{logoFile.name}</p>}
                <input ref={logoRef} type="file" accept="image/png,image/jpeg,image/webp" className="sr-only" tabIndex={-1} aria-hidden onChange={(e) => (setLogoFile(e.target.files?.[0] ?? null), (e.target.value = ''))} />
              </div>
            )}
            <Segmented label="Layout" value={mark.layout} onChange={(v) => set('layout', v)} options={[{ value: 'single', label: 'Single' }, { value: 'tile', label: 'Repeat' }]} />
            {mark.layout === 'single' && <AnchorPicker value={mark.anchor} onChange={(a) => set('anchor', a)} />}
            {(
              [
                ['size', `Size: ${mark.size}% of width`, 5, 100],
                ['opacity', `Opacity: ${mark.opacity}%`, 5, 100],
                ['angle', `Angle: ${mark.angle}°`, -90, 90],
              ] as const
            ).map(([k, label, min, max]) => (
              <div key={k}>
                <label htmlFor={`iw-${k}`} className="label">
                  {label}
                </label>
                <input id={`iw-${k}`} type="range" min={min} max={max} value={mark[k]} onChange={(e) => set(k, Number(e.target.value))} className="w-full accent-[rgb(var(--accent))]" />
              </div>
            ))}
            <Button variant="primary" size="lg" className="w-full justify-center" disabled={!ready || busy} loading={busy} onClick={start} icon={<Play size={16} />}>
              {jobs.length ? 'Apply again' : `Watermark ${inputs.length} image${inputs.length > 1 ? 's' : ''}`}
            </Button>
            {done.length > 1 && (
              <Button className="w-full justify-center" icon={<Download size={16} />} onClick={() => saveMany(done.map((j) => j.result!), 'watermarked-images.zip', { useDialog: settings.useSaveDialog })}>
                {t('action.downloadAll')}
              </Button>
            )}
          </Card>
        </div>
      )}
    </div>
  );
}
