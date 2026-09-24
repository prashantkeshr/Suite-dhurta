import { useRef, useState } from 'react';
import { Stamp, ImagePlus } from 'lucide-react';
import type { ToolDefinition } from '@/types/tool';
import { useStore } from '@/storage/store';
import { outputName } from '@/utils/filename';
import { UserError } from '@/utils/errors';
import { Button, Card, Segmented, Toggle } from '@/components/ui/primitives';
import { ErrorState } from '@/components/ui/states';
import { useJob } from './useJob';
import { loadPdf } from './engine';
import { watermarkPdf, type Anchor } from './stamp';
import { textToPng, imageFileToPng } from './textImage';
import { usePdfSource, PdfSourceHeader, PageRangeField, rangeOrAll, PdfResult } from './shared';
import { AnchorPicker } from './AnchorPicker';

export default function PdfWatermarkTool({ tool, initialFiles }: { tool: ToolDefinition; initialFiles?: File[] }) {
  const src = usePdfSource(initialFiles);
  const [kind, setKind] = useState<'text' | 'image'>('text');
  const [text, setText] = useState('CONFIDENTIAL');
  const [color, setColor] = useState('#dc2626');
  const [bold, setBold] = useState(true);
  const [logo, setLogo] = useState<File | null>(null);
  const [layout, setLayout] = useState<'single' | 'tile'>('single');
  const [anchor, setAnchor] = useState<Anchor>('center');
  const [size, setSize] = useState(60);
  const [opacity, setOpacity] = useState(25);
  const [angle, setAngle] = useState(45);
  const [range, setRange] = useState('');
  const logoInput = useRef<HTMLInputElement>(null);
  const job = useJob<Blob>();
  const addHistory = useStore((s) => s.addHistory);
  const count = src.source?.pages.length ?? 0;
  const pages = rangeOrAll(range, count);
  const ready = !!pages && (kind === 'text' ? !!text.trim() : !!logo);

  const run = async () => {
    if (!src.source || !pages) return;
    const file = src.source.file;
    const r = await job.run(async (_s, report) => {
      report(null, 'Preparing watermark…');
      let png: Uint8Array;
      try {
        png = kind === 'text' ? await textToPng(text.trim(), { color, bold }) : await imageFileToPng(logo!);
      } catch (err) {
        throw new UserError('The watermark image could not be prepared.', ['The logo file may be damaged or in an unsupported format'], ['Use a PNG or JPEG logo'], err);
      }
      report(null, 'Stamping pages…');
      const { doc } = await loadPdf(file);
      await watermarkPdf(doc, pages, png, { layout: layout === 'tile' ? 'tile' : anchor, widthFraction: size / 100, opacity: opacity / 100, angle, margin: 24 });
      report(null, 'Saving…');
      const bytes = await doc.save({ useObjectStreams: true });
      return new Blob([bytes as BlobPart], { type: 'application/pdf' });
    });
    if (r) addHistory(tool.id, `Watermarked ${pages.length} page${pages.length > 1 ? 's' : ''}`);
  };

  const reset = () => job.reset();

  return (
    <div className="space-y-4">
      <PdfSourceHeader tool={tool} src={src} />
      {src.source && (
        <div className="grid gap-4 lg:grid-cols-[1fr_320px]">
          <Card className="space-y-4 p-4">
            <Segmented label="Watermark type" value={kind} onChange={(v) => (setKind(v), reset())} options={[{ value: 'text', label: 'Text' }, { value: 'image', label: 'Image / logo' }]} />
            {kind === 'text' ? (
              <div className="grid gap-3 sm:grid-cols-[1fr_auto]">
                <div>
                  <label htmlFor="wm-text" className="label">
                    Text
                  </label>
                  <textarea id="wm-text" rows={2} className="input" value={text} onChange={(e) => (setText(e.target.value), reset())} placeholder="CONFIDENTIAL · गोपनीय" />
                  <p className="mt-1 text-xs text-muted">Any language your device can display, including Hindi.</p>
                </div>
                <div>
                  <label htmlFor="wm-color" className="label">
                    Colour
                  </label>
                  <input id="wm-color" type="color" value={color} onChange={(e) => (setColor(e.target.value), reset())} className="h-10 w-14 cursor-pointer rounded border border-line bg-surface" />
                  <Toggle checked={bold} onChange={(v) => (setBold(v), reset())} label="Bold" />
                </div>
              </div>
            ) : (
              <div>
                <Button icon={<ImagePlus size={16} />} onClick={() => logoInput.current?.click()}>
                  {logo ? 'Change image' : 'Choose image'}
                </Button>
                {logo && <span className="ml-3 text-sm text-muted">{logo.name}</span>}
                <input ref={logoInput} type="file" accept="image/png,image/jpeg,image/webp" className="sr-only" tabIndex={-1} aria-hidden onChange={(e) => (setLogo(e.target.files?.[0] ?? null), reset(), (e.target.value = ''))} />
                <p className="mt-1 text-xs text-muted">PNG with transparency works best.</p>
              </div>
            )}
            <div className="flex flex-wrap gap-6">
              <Segmented label="Layout" value={layout} onChange={(v) => (setLayout(v), reset())} options={[{ value: 'single', label: 'Single' }, { value: 'tile', label: 'Repeat across page' }]} />
              {layout === 'single' && <AnchorPicker value={anchor} onChange={(a) => (setAnchor(a), reset())} />}
            </div>
            <div className="grid gap-4 sm:grid-cols-3">
              {[
                { id: 'wm-size', label: `Size: ${size}% of width`, value: size, set: setSize, min: 5, max: 100 },
                { id: 'wm-op', label: `Opacity: ${opacity}%`, value: opacity, set: setOpacity, min: 5, max: 100 },
                { id: 'wm-angle', label: `Angle: ${angle}°`, value: angle, set: setAngle, min: -90, max: 90 },
              ].map((s) => (
                <div key={s.id}>
                  <label htmlFor={s.id} className="label">
                    {s.label}
                  </label>
                  <input id={s.id} type="range" min={s.min} max={s.max} value={s.value} onChange={(e) => (s.set(Number(e.target.value)), reset())} className="w-full accent-[rgb(var(--accent))]" />
                </div>
              ))}
            </div>
            <PageRangeField value={range} onChange={(v) => (setRange(v), reset())} pageCount={count} />
          </Card>
          <Card className="h-fit space-y-3 p-4 lg:sticky lg:top-20">
            {!job.running && (
              <Button variant="primary" size="lg" className="w-full justify-center" disabled={!ready} onClick={run} icon={<Stamp size={16} />}>
                Apply watermark
              </Button>
            )}
            <PdfResult running={job.running} progress={job.progress} step={job.step} onCancel={job.cancel} result={job.result} filename={outputName(src.source.file.name, 'watermarked', 'pdf')} previewPage={pages?.[0] ?? 0} />
            {!job.result && !job.running && <p className="text-xs text-muted">A preview of the actual result appears here before you download.</p>}
          </Card>
        </div>
      )}
      {job.error != null && <ErrorState error={job.error} onRetry={run} />}
    </div>
  );
}
