import { useState } from 'react';
import { Minimize2, AlertTriangle } from 'lucide-react';
import type { ToolDefinition, ToolPreset } from '@/types/tool';
import { useStore } from '@/storage/store';
import { formatBytes } from '@/utils/format';
import { outputName } from '@/utils/filename';
import { Button, Card, Segmented, Select, Toggle } from '@/components/ui/primitives';
import { ErrorState } from '@/components/ui/states';
import { useJob } from './useJob';
import { usePdfSource, PdfSourceHeader, PdfResult } from './shared';
import { compressLight, compressStrong } from './compress';

const TARGETS = [100, 200, 500, 1000, 2000];
const kbLabel = (kb: number) => (kb >= 1000 ? `${kb / 1000} MB` : `${kb} KB`);

export default function PdfCompressTool({ tool, initialFiles, preset }: { tool: ToolDefinition; initialFiles?: File[]; preset?: ToolPreset }) {
  const src = usePdfSource(initialFiles);
  const [mode, setMode] = useState<'strong' | 'light'>(preset?.mode === 'light' ? 'light' : 'strong');
  const [dpi, setDpi] = useState(String(preset?.dpi ?? 150));
  const [quality, setQuality] = useState(0.7);
  const [grayscale, setGrayscale] = useState(false);
  const [targetKb, setTargetKb] = useState(preset?.targetKb ? String(preset.targetKb) : '');
  const [note, setNote] = useState('');
  const job = useJob<Blob>();
  const addHistory = useStore((s) => s.addHistory);

  const run = async () => {
    if (!src.source) return;
    const file = src.source.file;
    setNote('');
    const r = await job.run(async (signal, report) => {
      if (mode === 'light') {
        report(null, 'Optimising PDF structure…');
        return compressLight(file);
      }
      const out = await compressStrong(file, { dpi: Number(dpi), quality, grayscale, targetBytes: Number(targetKb) > 0 ? Number(targetKb) * 1000 : undefined }, signal, (v, s) => report(v, s));
      if (Number(targetKb) > 0) setNote(out.reached ? `Reached with ${out.dpi} dpi at ${Math.round(out.quality * 100)}% quality.` : `Could not get under ${kbLabel(Number(targetKb))} while keeping text readable (stopped at ${out.dpi} dpi). This is the smallest readable version.`);
      return out.blob;
    });
    if (r) {
      const saved = 1 - r.size / file.size;
      addHistory(tool.id, `${formatBytes(file.size)} → ${formatBytes(r.size)} (${mode})`);
      if (saved <= 0) setNote((n) => `${n} The result is not smaller than the original — your PDF is already compact.${mode === 'light' ? ' Try “Strong”.' : ''}`.trim());
    }
  };

  const original = src.source?.file.size ?? 0;
  return (
    <div className="space-y-4">
      <PdfSourceHeader tool={tool} src={src} />
      {src.source && (
        <div className="grid gap-4 lg:grid-cols-[1fr_320px]">
          <Card className="space-y-4 p-4">
            <Segmented
              label="Compression"
              value={mode}
              onChange={(v) => (setMode(v), job.reset())}
              options={[
                { value: 'strong', label: 'Strong — smallest file' },
                { value: 'light', label: 'Light — keeps text selectable' },
              ]}
            />
            {mode === 'strong' ? (
              <>
                <p className="flex gap-2 text-sm text-muted">
                  <AlertTriangle size={16} className="mt-0.5 shrink-0 text-warning" aria-hidden />
                  Pages are stored as images: ideal for scanned documents, certificates and photos, but text can no longer be selected, searched or copied.
                </p>
                <div>
                  <label htmlFor="pdf-target" className="label">
                    Target size (optional)
                  </label>
                  <div className="relative max-w-xs">
                    <input id="pdf-target" className="input pr-12 tabular-nums" inputMode="numeric" placeholder="Any size" value={targetKb} onChange={(e) => setTargetKb(e.target.value.replace(/[^0-9]/g, '').slice(0, 6))} />
                    <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-sm text-muted">KB</span>
                  </div>
                  <div className="mt-1.5 flex flex-wrap gap-1">
                    {TARGETS.map((kb) => (
                      <Button key={kb} size="sm" variant={targetKb === String(kb) ? 'primary' : 'secondary'} aria-pressed={targetKb === String(kb)} onClick={() => setTargetKb(targetKb === String(kb) ? '' : String(kb))}>
                        {kbLabel(kb)}
                      </Button>
                    ))}
                  </div>
                </div>
                <div className="grid gap-3 sm:grid-cols-2">
                  <Select
                    label="Resolution"
                    value={dpi}
                    onChange={(e) => setDpi(e.target.value)}
                    options={[
                      { value: '72', label: '72 dpi — screen only, smallest' },
                      { value: '100', label: '100 dpi — email' },
                      { value: '150', label: '150 dpi — recommended' },
                      { value: '200', label: '200 dpi — sharp print' },
                    ]}
                  />
                  {!(Number(targetKb) > 0) && (
                    <div>
                      <label htmlFor="pdf-q" className="label">
                        Image quality: {Math.round(quality * 100)}%
                      </label>
                      <input id="pdf-q" type="range" min={0.3} max={0.9} step={0.05} value={quality} onChange={(e) => setQuality(Number(e.target.value))} className="w-full accent-[rgb(var(--accent))]" />
                    </div>
                  )}
                </div>
                <Toggle checked={grayscale} onChange={setGrayscale} label="Black and white" description="Much smaller for text documents and forms." />
              </>
            ) : (
              <p className="text-sm text-muted">Re-saves the PDF with compressed internal structures. Text, links and bookmarks stay exactly as they are, but the saving is usually modest (0–20%). For big reductions use Strong.</p>
            )}
          </Card>
          <Card className="h-fit space-y-3 p-4">
            <p className="text-sm">
              Original: <strong>{formatBytes(original)}</strong> · {src.source.pages.length} page{src.source.pages.length > 1 ? 's' : ''}
            </p>
            {!job.running && !job.result && (
              <Button variant="primary" size="lg" className="w-full justify-center" icon={<Minimize2 size={16} />} onClick={run}>
                Compress PDF
              </Button>
            )}
            {job.result && (
              <p className="text-sm">
                New size: <strong>{formatBytes(job.result.size)}</strong>{' '}
                <span className={job.result.size < original ? 'text-success' : 'text-warning'}>({Math.round((1 - job.result.size / original) * 100)}% smaller)</span>
              </p>
            )}
            {note && <p className="text-xs text-muted">{note}</p>}
            {job.error ? <ErrorState error={job.error} onRetry={run} /> : null}
            <PdfResult running={job.running} progress={job.progress} step={job.step} onCancel={job.cancel} result={job.result} filename={outputName(src.source.file.name, 'compressed', 'application/pdf')} />
            {job.result && (
              <Button className="w-full justify-center" onClick={() => job.reset()}>
                Try other settings
              </Button>
            )}
          </Card>
        </div>
      )}
    </div>
  );
}
