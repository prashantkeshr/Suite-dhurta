import { useState } from 'react';
import { ListOrdered } from 'lucide-react';
import type { ToolDefinition } from '@/types/tool';
import { useStore } from '@/storage/store';
import { outputName } from '@/utils/filename';
import { Button, Card, Select } from '@/components/ui/primitives';
import { ErrorState } from '@/components/ui/states';
import { useJob } from './useJob';
import { loadPdf } from './engine';
import { addPageNumbers, formatPageNumber, type Anchor } from './stamp';
import { usePdfSource, PdfSourceHeader, PageRangeField, rangeOrAll, PdfResult } from './shared';
import { AnchorPicker } from './AnchorPicker';

const FORMATS = [
  { value: '{n}', label: '1' },
  { value: 'Page {n}', label: 'Page 1' },
  { value: 'Page {n} of {total}', label: 'Page 1 of 10' },
  { value: '{n} / {total}', label: '1 / 10' },
  { value: '- {n} -', label: '- 1 -' },
  { value: 'custom', label: 'Custom…' },
];

export default function PdfPageNumbersTool({ tool, initialFiles }: { tool: ToolDefinition; initialFiles?: File[] }) {
  const src = usePdfSource(initialFiles);
  const [preset, setPreset] = useState('Page {n} of {total}');
  const [custom, setCustom] = useState('Page {n}');
  const [anchor, setAnchor] = useState<Anchor>('bottom-center');
  const [fontSize, setFontSize] = useState('11');
  const [margin, setMargin] = useState('24');
  const [startAt, setStartAt] = useState('1');
  const [color, setColor] = useState('#333333');
  const [range, setRange] = useState('');
  const job = useJob<Blob>();
  const addHistory = useStore((s) => s.addHistory);
  const count = src.source?.pages.length ?? 0;
  const pages = rangeOrAll(range, count);
  const format = preset === 'custom' ? custom : preset;
  const reset = () => job.reset();

  const run = async () => {
    if (!src.source || !pages) return;
    const file = src.source.file;
    const r = await job.run(async (_s, report) => {
      report(null, 'Numbering pages…');
      const { doc } = await loadPdf(file);
      await addPageNumbers(doc, pages, {
        format,
        anchor,
        fontSize: Math.min(72, Math.max(4, Number(fontSize) || 11)),
        margin: Math.max(0, Number(margin) || 0),
        startAt: Math.max(0, Math.floor(Number(startAt) || 1)),
        color,
      });
      report(null, 'Saving…');
      return new Blob([(await doc.save({ useObjectStreams: true })) as BlobPart], { type: 'application/pdf' });
    });
    if (r) addHistory(tool.id, `Numbered ${pages.length} pages`);
  };

  const example = formatPageNumber(format, Math.max(0, Number(startAt) || 1), (pages?.length ?? count) + (Number(startAt) || 1) - 1);

  return (
    <div className="space-y-4">
      <PdfSourceHeader tool={tool} src={src} />
      {src.source && (
        <div className="grid gap-4 lg:grid-cols-[1fr_320px]">
          <Card className="space-y-4 p-4">
            <div className="grid gap-3 sm:grid-cols-2">
              <Select label="Format" value={preset} onChange={(e) => (setPreset(e.target.value), reset())} options={FORMATS} />
              {preset === 'custom' && (
                <div>
                  <label htmlFor="pn-custom" className="label">
                    Custom format
                  </label>
                  <input id="pn-custom" className="input font-mono" value={custom} onChange={(e) => (setCustom(e.target.value), reset())} />
                  <p className="mt-1 text-xs text-muted">Use {'{n}'} for the number and {'{total}'} for the count. Latin characters only.</p>
                </div>
              )}
            </div>
            <p className="text-sm">
              Example: <span className="rounded bg-surface2 px-2 py-0.5 font-mono">{example}</span>
            </p>
            <div className="flex flex-wrap gap-6">
              <AnchorPicker value={anchor} onChange={(a) => (setAnchor(a), reset())} />
              <div className="grid flex-1 grid-cols-2 gap-3 sm:grid-cols-4">
                {[
                  { id: 'pn-size', label: 'Font size', value: fontSize, set: setFontSize },
                  { id: 'pn-margin', label: 'Margin (pt)', value: margin, set: setMargin },
                  { id: 'pn-start', label: 'Start at', value: startAt, set: setStartAt },
                ].map((f) => (
                  <div key={f.id}>
                    <label htmlFor={f.id} className="label">
                      {f.label}
                    </label>
                    <input id={f.id} className="input" inputMode="numeric" value={f.value} onChange={(e) => (f.set(e.target.value.replace(/\D/g, '')), reset())} />
                  </div>
                ))}
                <div>
                  <label htmlFor="pn-color" className="label">
                    Colour
                  </label>
                  <input id="pn-color" type="color" value={color} onChange={(e) => (setColor(e.target.value), reset())} className="h-10 w-full cursor-pointer rounded border border-line bg-surface" />
                </div>
              </div>
            </div>
            <PageRangeField label="Pages to number" value={range} onChange={(v) => (setRange(v), reset())} pageCount={count} />
            <p className="text-xs text-muted">Numbering counts only the selected pages. For example, select 2- and start at 1 to skip a cover page. Rotated pages are handled so numbers appear upright.</p>
          </Card>
          <Card className="h-fit space-y-3 p-4 lg:sticky lg:top-20">
            {!job.running && (
              <Button variant="primary" size="lg" className="w-full justify-center" disabled={!pages || !format.includes('{n}')} onClick={run} icon={<ListOrdered size={16} />}>
                Add page numbers
              </Button>
            )}
            {!format.includes('{n}') && <p className="text-xs text-error">The format must contain {'{n}'}.</p>}
            <PdfResult running={job.running} progress={job.progress} step={job.step} onCancel={job.cancel} result={job.result} filename={outputName(src.source.file.name, 'numbered', 'pdf')} previewPage={pages?.[0] ?? 0} />
          </Card>
        </div>
      )}
      {job.error != null && <ErrorState error={job.error} onRetry={run} />}
    </div>
  );
}
