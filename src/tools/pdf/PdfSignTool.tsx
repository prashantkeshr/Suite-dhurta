import { useEffect, useRef, useState } from 'react';
import { ChevronLeft, ChevronRight, ImagePlus, Info, PenTool } from 'lucide-react';
import type { ToolDefinition } from '@/types/tool';
import { useStore } from '@/storage/store';
import { useObjectUrl } from '@/hooks/useObjectUrl';
import { outputName } from '@/utils/filename';
import { UserError } from '@/utils/errors';
import { Button, Card, Tabs } from '@/components/ui/primitives';
import { ErrorState } from '@/components/ui/states';
import { useJob } from './useJob';
import { loadPdf } from './engine';
import { placeImage } from './stamp';
import { renderPage, canvasToBlob, thumbScale } from './render';
import { textToPng, imageFileToPng } from './textImage';
import { usePdfSource, PdfSourceHeader, PdfResult } from './shared';
import { SignaturePad } from './SignaturePad';

const TYPE_FONTS = [
  { id: 'script', label: 'Script', family: '"Segoe Script", "Brush Script MT", "Snell Roundhand", cursive' },
  { id: 'serif', label: 'Serif italic', family: 'Georgia, "Times New Roman", serif', italic: true },
  { id: 'sans', label: 'Plain', family: 'system-ui, "Noto Sans", "Noto Sans Devanagari", sans-serif' },
];

export default function PdfSignTool({ tool, initialFiles }: { tool: ToolDefinition; initialFiles?: File[] }) {
  const src = usePdfSource(initialFiles);
  const [mode, setMode] = useState<'draw' | 'type' | 'upload'>('draw');
  const [color, setColor] = useState('#1e3a8a');
  const [drawn, setDrawn] = useState<Blob | null>(null);
  const [typed, setTyped] = useState('');
  const [typeFont, setTypeFont] = useState('script');
  const [typedPng, setTypedPng] = useState<Blob | null>(null);
  const [uploaded, setUploaded] = useState<File | null>(null);
  const [page, setPage] = useState(0);
  const [pageImg, setPageImg] = useState<Blob | null>(null);
  const [pos, setPos] = useState({ cx: 0.7, cy: 0.85 });
  const [width, setWidth] = useState(30);
  const uploadRef = useRef<HTMLInputElement>(null);
  const stageRef = useRef<HTMLDivElement>(null);
  const dragging = useRef(false);
  const job = useJob<Blob>();
  const addHistory = useStore((s) => s.addHistory);
  const count = src.source?.pages.length ?? 0;

  // Render the selected page large enough to place the signature precisely.
  useEffect(() => {
    let alive = true;
    setPageImg(null);
    if (!src.preview) return;
    (async () => {
      const scale = await thumbScale(src.preview!, page, 900);
      const canvas = await renderPage(src.preview!, page, scale);
      const blob = await canvasToBlob(canvas, 'image/jpeg', 0.85);
      canvas.width = canvas.height = 0;
      if (alive) setPageImg(blob);
    })().catch(() => {});
    return () => void (alive = false);
  }, [src.preview, page]);

  // Typed signatures are rendered with the chosen font.
  useEffect(() => {
    let alive = true;
    if (!typed.trim()) return setTypedPng(null);
    const f = TYPE_FONTS.find((x) => x.id === typeFont)!;
    textToPng(typed.trim(), { fontFamily: f.family, italic: f.italic, color, px: 120 }).then((b) => alive && setTypedPng(new Blob([b as BlobPart], { type: 'image/png' })));
    return () => void (alive = false);
  }, [typed, typeFont, color]);

  const signature = mode === 'draw' ? drawn : mode === 'type' ? typedPng : uploaded;
  const sigUrl = useObjectUrl(signature);
  const pageUrl = useObjectUrl(pageImg);
  const [sigRatio, setSigRatio] = useState(3);

  const moveTo = (e: React.PointerEvent) => {
    const r = stageRef.current!.getBoundingClientRect();
    setPos({ cx: Math.min(1, Math.max(0, (e.clientX - r.left) / r.width)), cy: Math.min(1, Math.max(0, (e.clientY - r.top) / r.height)) });
    job.reset();
  };

  const apply = async () => {
    if (!src.source || !signature) return;
    const file = src.source.file;
    const r = await job.run(async (_s, report) => {
      report(null, 'Placing signature…');
      let png: Uint8Array;
      try {
        png = signature.type === 'image/png' && mode !== 'upload' ? new Uint8Array(await signature.arrayBuffer()) : await imageFileToPng(signature, 1200);
      } catch (err) {
        throw new UserError('The signature image could not be read.', ['The file may be damaged or unsupported'], ['Use a PNG or JPEG image'], err);
      }
      const { doc } = await loadPdf(file);
      await placeImage(doc, page, png, { cx: pos.cx, cy: pos.cy, widthFraction: width / 100 });
      report(null, 'Saving…');
      return new Blob([(await doc.save({ useObjectStreams: true })) as BlobPart], { type: 'application/pdf' });
    });
    if (r) addHistory(tool.id, `Signed page ${page + 1}`);
  };

  return (
    <div className="space-y-4">
      <PdfSourceHeader tool={tool} src={src} />
      {src.source && (
        <>
          <div className="flex items-start gap-2 rounded-md border border-info/30 bg-info/5 p-3 text-sm">
            <Info size={16} className="mt-0.5 shrink-0 text-info" aria-hidden />
            <p className="text-muted">
              This adds a <strong className="text-fg">visual signature</strong> (an image of your signature) to the page. It is not a certified digital signature: there is no certificate or tamper-evident seal. For legally binding e-signatures, check what the recipient requires.
            </p>
          </div>
          <div className="grid gap-4 lg:grid-cols-[1fr_340px]">
            <Card className="p-3">
              <div className="mb-2 flex items-center justify-between gap-2">
                <Button size="sm" icon={<ChevronLeft size={14} />} disabled={page === 0} onClick={() => (setPage(page - 1), job.reset())}>
                  Prev
                </Button>
                <span className="text-sm">
                  Page {page + 1} of {count}
                </span>
                <Button size="sm" disabled={page >= count - 1} onClick={() => (setPage(page + 1), job.reset())}>
                  Next <ChevronRight size={14} />
                </Button>
              </div>
              <div className="flex justify-center rounded bg-surface2 p-2">
                <div
                  ref={stageRef}
                  className="relative inline-block max-w-full cursor-crosshair touch-none select-none"
                  onPointerDown={(e) => {
                    if (!signature) return;
                    dragging.current = true;
                    e.currentTarget.setPointerCapture(e.pointerId);
                    moveTo(e);
                  }}
                  onPointerMove={(e) => dragging.current && moveTo(e)}
                  onPointerUp={() => (dragging.current = false)}
                >
                  {pageUrl ? <img src={pageUrl} alt={`Page ${page + 1}`} draggable={false} className="block max-h-[70vh] max-w-full bg-white shadow" /> : <div className="flex h-96 w-72 items-center justify-center text-sm text-muted">Rendering page…</div>}
                  {pageUrl && sigUrl && (
                    <img
                      src={sigUrl}
                      alt="Signature position"
                      draggable={false}
                      onLoad={(e) => setSigRatio(e.currentTarget.naturalWidth / Math.max(1, e.currentTarget.naturalHeight))}
                      className="pointer-events-none absolute outline outline-1 outline-dashed outline-accent"
                      style={{ width: `${width}%`, left: `${pos.cx * 100}%`, top: `${pos.cy * 100}%`, transform: 'translate(-50%, -50%)', aspectRatio: String(sigRatio) }}
                    />
                  )}
                </div>
              </div>
              <p className="mt-2 text-center text-xs text-muted">{signature ? 'Click or drag on the page to position the signature.' : 'Create your signature on the right first.'}</p>
            </Card>

            <Card className="h-fit space-y-4 p-4 lg:sticky lg:top-20">
              <Tabs label="Signature source" value={mode} onChange={(v) => (setMode(v), job.reset())} tabs={[{ id: 'draw', label: 'Draw' }, { id: 'type', label: 'Type' }, { id: 'upload', label: 'Upload' }]} />
              {mode === 'draw' && <SignaturePad color={color} onChange={(b) => (setDrawn(b), job.reset())} />}
              {mode === 'type' && (
                <div className="space-y-2">
                  <label htmlFor="sig-name" className="label">
                    Your name
                  </label>
                  <input id="sig-name" className="input" value={typed} onChange={(e) => (setTyped(e.target.value), job.reset())} placeholder="Prashant Keshri" />
                  <div role="radiogroup" aria-label="Style" className="flex flex-wrap gap-1">
                    {TYPE_FONTS.map((f) => (
                      <button key={f.id} role="radio" aria-checked={typeFont === f.id} onClick={() => setTypeFont(f.id)} className={`min-h-[36px] rounded-md border px-3 text-sm ${typeFont === f.id ? 'border-accent bg-accent/10 text-accent' : 'border-line'}`} style={{ fontFamily: f.family, fontStyle: f.italic ? 'italic' : undefined }}>
                        {typed.trim() || f.label}
                      </button>
                    ))}
                  </div>
                </div>
              )}
              {mode === 'upload' && (
                <div>
                  <Button icon={<ImagePlus size={16} />} onClick={() => uploadRef.current?.click()}>
                    {uploaded ? 'Change image' : 'Choose signature image'}
                  </Button>
                  <input ref={uploadRef} type="file" accept="image/png,image/jpeg,image/webp" className="sr-only" tabIndex={-1} aria-hidden onChange={(e) => (setUploaded(e.target.files?.[0] ?? null), job.reset(), (e.target.value = ''))} />
                  <p className="mt-1 text-xs text-muted">A PNG with a transparent background looks best.</p>
                </div>
              )}
              {mode !== 'upload' && (
                <div className="flex items-center gap-2">
                  <label htmlFor="sig-color" className="label mb-0">
                    Ink
                  </label>
                  {['#1e3a8a', '#111827', '#1d4ed8'].map((c) => (
                    <button key={c} aria-label={`Ink colour ${c}`} aria-pressed={color === c} onClick={() => setColor(c)} className="h-7 w-7 rounded-full border-2" style={{ background: c, borderColor: color === c ? 'rgb(var(--accent))' : 'transparent' }} />
                  ))}
                  <input id="sig-color" type="color" value={color} onChange={(e) => setColor(e.target.value)} className="h-7 w-9 cursor-pointer rounded border border-line" />
                </div>
              )}
              <div>
                <label htmlFor="sig-w" className="label">
                  Size: {width}% of page width
                </label>
                <input id="sig-w" type="range" min={8} max={80} value={width} onChange={(e) => (setWidth(Number(e.target.value)), job.reset())} className="w-full accent-[rgb(var(--accent))]" />
              </div>
              {!job.running && (
                <Button variant="primary" size="lg" className="w-full justify-center" disabled={!signature} onClick={apply} icon={<PenTool size={16} />}>
                  Sign page {page + 1}
                </Button>
              )}
              <PdfResult running={job.running} progress={job.progress} step={job.step} onCancel={job.cancel} result={job.result} filename={outputName(src.source.file.name, 'signed', 'pdf')} previewPage={page} />
            </Card>
          </div>
        </>
      )}
      {job.error != null && <ErrorState error={job.error} onRetry={apply} />}
    </div>
  );
}
