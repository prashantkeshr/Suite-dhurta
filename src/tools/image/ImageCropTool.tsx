import { useCallback, useRef, useState } from 'react';
import { clsx } from 'clsx';
import { Crop, Download, X } from 'lucide-react';
import type { ToolDefinition } from '@/types/tool';
import { acceptAttribute, formatLabel } from '@/tools/registry';
import { detectFile } from '@/filesystem/detect';
import { useObjectUrl } from '@/hooks/useObjectUrl';
import { useInitialFiles } from '@/hooks/useInitialFiles';
import { useStore } from '@/storage/store';
import { outputName } from '@/utils/filename';
import { formatBytes } from '@/utils/format';
import { UserError } from '@/utils/errors';
import { t } from '@/i18n';
import { Button, Card, Select } from '@/components/ui/primitives';
import { ErrorState } from '@/components/ui/states';
import { FileDropzone } from '@/components/files/FileDropzone';
import { useSaver } from '@/components/tools/common';
import { resolveOutputMime, type OutputMime } from './ops';
import { centeredRect, dragRect, normalize, type Handle, type Rect } from './cropMath';

const ASPECTS: { id: string; label: string; value: number | null }[] = [
  { id: 'free', label: 'Free', value: null },
  { id: '1:1', label: '1:1', value: 1 },
  { id: '4:3', label: '4:3', value: 4 / 3 },
  { id: '3:4', label: '3:4', value: 3 / 4 },
  { id: '16:9', label: '16:9', value: 16 / 9 },
  { id: '9:16', label: '9:16', value: 9 / 16 },
  { id: '3:2', label: '3:2', value: 3 / 2 },
];

const HANDLES: { h: Handle; cls: string; cursor: string }[] = [
  { h: 'nw', cls: '-left-2 -top-2', cursor: 'nwse-resize' },
  { h: 'n', cls: 'left-1/2 -top-2 -translate-x-1/2', cursor: 'ns-resize' },
  { h: 'ne', cls: '-right-2 -top-2', cursor: 'nesw-resize' },
  { h: 'e', cls: '-right-2 top-1/2 -translate-y-1/2', cursor: 'ew-resize' },
  { h: 'se', cls: '-right-2 -bottom-2', cursor: 'nwse-resize' },
  { h: 's', cls: 'left-1/2 -bottom-2 -translate-x-1/2', cursor: 'ns-resize' },
  { h: 'sw', cls: '-left-2 -bottom-2', cursor: 'nesw-resize' },
  { h: 'w', cls: '-left-2 top-1/2 -translate-y-1/2', cursor: 'ew-resize' },
];

interface Loaded {
  file: File;
  mime: string;
  width: number;
  height: number;
}

export default function ImageCropTool({ tool, initialFiles }: { tool: ToolDefinition; initialFiles?: File[] }) {
  const [img, setImg] = useState<Loaded | null>(null);
  const [error, setError] = useState<unknown>(null);
  const [rect, setRect] = useState<Rect>({ x: 0, y: 0, w: 1, h: 1 });
  const [aspectId, setAspectId] = useState('free');
  const [format, setFormat] = useState<OutputMime | 'original'>('original');
  const [result, setResult] = useState<{ blob: Blob; name: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const stage = useRef<HTMLDivElement>(null);
  const dragState = useRef<{ handle: Handle; start: Rect; px: number; py: number } | null>(null);
  const url = useObjectUrl(img?.file);
  const resultUrl = useObjectUrl(result?.blob);
  const save = useSaver();
  const addHistory = useStore((s) => s.addHistory);
  const aspect = ASPECTS.find((a) => a.id === aspectId)!.value;

  const open = useCallback(async (files: File[]) => {
    setError(null);
    setResult(null);
    const file = files[0];
    try {
      const d = await detectFile(file);
      if (d.kind !== 'image' || d.mime === 'image/heic' || d.mime === 'image/tiff') throw new UserError(`“${file.name}” can’t be cropped here.`, [`It looks like: ${d.label}`], ['Use a JPEG, PNG, WebP, GIF or BMP image']);
      const bmp = await createImageBitmap(file).catch((e) => {
        throw new UserError('This image could not be decoded.', ['The format may not be supported by this browser', 'The file may be damaged'], [], e);
      });
      const loaded = { file, mime: d.mime, width: bmp.width, height: bmp.height };
      bmp.close();
      setImg(loaded);
      setRect(centeredRect(loaded.width, loaded.height, null));
      setAspectId('free');
    } catch (err) {
      setImg(null);
      setError(err);
    }
  }, []);
  useInitialFiles(initialFiles, open);

  const scale = () => (img && stage.current ? stage.current.getBoundingClientRect().width / img.width : 1);

  const onPointerDown = (handle: Handle) => (e: React.PointerEvent) => {
    e.stopPropagation();
    e.currentTarget.setPointerCapture(e.pointerId);
    dragState.current = { handle, start: rect, px: e.clientX, py: e.clientY };
  };
  const onPointerMove = (e: React.PointerEvent) => {
    const d = dragState.current;
    if (!d || !img) return;
    const s = scale();
    setRect(dragRect(d.start, d.handle, (e.clientX - d.px) / s, (e.clientY - d.py) / s, img.width, img.height, aspect));
    setResult(null);
  };
  const onPointerUp = () => {
    if (dragState.current && img) setRect((r) => normalize(r, img.width, img.height));
    dragState.current = null;
  };

  const setField = (k: keyof Rect, v: string) => {
    if (!img) return;
    const n = Number(v.replace(/\D/g, '')) || 0;
    let next = { ...rect, [k]: n };
    if (aspect && (k === 'w' || k === 'h')) next = k === 'w' ? { ...next, h: n / aspect } : { ...next, w: n * aspect };
    setRect(normalize(next, img.width, img.height));
    setResult(null);
  };

  const crop = async () => {
    if (!img) return;
    setBusy(true);
    setError(null);
    try {
      const r = normalize(rect, img.width, img.height);
      const mime = resolveOutputMime(img.mime, format);
      const bmp = await createImageBitmap(img.file);
      const canvas = document.createElement('canvas');
      canvas.width = r.w;
      canvas.height = r.h;
      const ctx = canvas.getContext('2d')!;
      if (mime === 'image/jpeg') {
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(0, 0, r.w, r.h);
      }
      ctx.drawImage(bmp, r.x, r.y, r.w, r.h, 0, 0, r.w, r.h);
      bmp.close();
      const blob = await new Promise<Blob | null>((res) => canvas.toBlob(res, mime, 0.92));
      canvas.width = canvas.height = 0;
      if (!blob) throw new UserError('The browser could not encode the cropped image.');
      setResult({ blob, name: outputName(img.file.name, 'cropped', blob.type) });
      addHistory(tool.id, `Cropped to ${r.w} × ${r.h}`);
    } catch (err) {
      setError(err);
    } finally {
      setBusy(false);
    }
  };

  const pct = (v: number, total: number) => `${(v / total) * 100}%`;

  return (
    <div className="space-y-4">
      {!img && <FileDropzone onFiles={open} accept={acceptAttribute(tool)} acceptLabel={formatLabel(tool.inputTypes)} multiple={false} />}
      {error != null && <ErrorState error={error} />}
      {img && url && (
        <div className="grid gap-4 lg:grid-cols-[1fr_300px]">
          <Card className="p-3">
            <div className="mb-2 flex items-center gap-2 text-sm">
              <p className="min-w-0 flex-1 truncate font-medium">
                {img.file.name} <span className="font-normal text-muted">· {img.width} × {img.height}</span>
              </p>
              <Button size="sm" variant="ghost" icon={<X size={14} />} onClick={() => (setImg(null), setResult(null))}>
                Change image
              </Button>
            </div>
            <div className="flex justify-center rounded bg-surface2 p-2">
              <div ref={stage} className="checker relative inline-block max-w-full touch-none select-none" onPointerMove={onPointerMove} onPointerUp={onPointerUp} onPointerCancel={onPointerUp}>
                <img src={url} alt="Image to crop" draggable={false} className="block max-h-[65vh] max-w-full" />
                {/* Dim everything outside the crop area. */}
                <div
                  className="absolute cursor-move border-2 border-white outline outline-1 outline-black/50"
                  style={{ left: pct(rect.x, img.width), top: pct(rect.y, img.height), width: pct(rect.w, img.width), height: pct(rect.h, img.height), boxShadow: '0 0 0 9999px rgb(0 0 0 / 0.5)' }}
                  onPointerDown={onPointerDown('move')}
                  role="group"
                  aria-label={`Crop area ${rect.w} by ${rect.h} pixels`}
                >
                  <div className="pointer-events-none absolute inset-0 grid grid-cols-3 grid-rows-3">
                    {Array.from({ length: 9 }, (_, i) => (
                      <div key={i} className="border border-white/25" />
                    ))}
                  </div>
                  {HANDLES.map(({ h, cls, cursor }) => (
                    <span key={h} onPointerDown={onPointerDown(h)} className={clsx('absolute h-4 w-4 rounded-sm border-2 border-accent bg-white', cls)} style={{ cursor }} aria-hidden />
                  ))}
                </div>
              </div>
            </div>
            <p className="mt-2 text-center text-xs text-muted">Drag the box to move it, or drag a handle to resize.</p>
          </Card>

          <Card className="h-fit space-y-4 p-4 lg:sticky lg:top-20">
            <div>
              <span className="label">Aspect ratio</span>
              <div role="radiogroup" aria-label="Aspect ratio" className="flex flex-wrap gap-1">
                {ASPECTS.map((a) => (
                  <button
                    key={a.id}
                    role="radio"
                    aria-checked={aspectId === a.id}
                    onClick={() => {
                      setAspectId(a.id);
                      setRect(centeredRect(img.width, img.height, a.value));
                      setResult(null);
                    }}
                    className={clsx('min-h-[34px] rounded-md border px-2.5 text-sm', aspectId === a.id ? 'border-accent bg-accent/10 text-accent' : 'border-line')}
                  >
                    {a.label}
                  </button>
                ))}
              </div>
            </div>
            <div className="grid grid-cols-2 gap-2">
              {(['x', 'y', 'w', 'h'] as const).map((k) => (
                <div key={k}>
                  <label htmlFor={`crop-${k}`} className="label">
                    {k === 'w' ? 'Width' : k === 'h' ? 'Height' : k.toUpperCase()} (px)
                  </label>
                  <input id={`crop-${k}`} className="input tabular-nums" inputMode="numeric" value={Math.round(rect[k])} onChange={(e) => setField(k, e.target.value)} />
                </div>
              ))}
            </div>
            <Select
              label="Output format"
              value={format}
              onChange={(e) => (setFormat(e.target.value as OutputMime | 'original'), setResult(null))}
              options={[
                { value: 'original', label: 'Same as original' },
                { value: 'image/png', label: 'PNG' },
                { value: 'image/jpeg', label: 'JPEG' },
                { value: 'image/webp', label: 'WebP' },
              ]}
            />
            <Button variant="primary" size="lg" className="w-full justify-center" loading={busy} onClick={crop} icon={<Crop size={16} />}>
              Crop image
            </Button>
            {result && resultUrl && (
              <div className="space-y-2 rounded-md border border-success/30 bg-success/5 p-3 text-sm">
                <div className="checker flex max-h-48 justify-center overflow-hidden rounded border border-line">
                  <img src={resultUrl} alt="Cropped result" className="max-h-48 object-contain" />
                </div>
                <p>
                  {Math.round(rect.w)} × {Math.round(rect.h)} · {formatBytes(result.blob.size)}
                </p>
                <Button variant="primary" className="w-full justify-center" icon={<Download size={16} />} onClick={() => save(result.blob, result.name)}>
                  {t('action.download')}
                </Button>
              </div>
            )}
          </Card>
        </div>
      )}
    </div>
  );
}
