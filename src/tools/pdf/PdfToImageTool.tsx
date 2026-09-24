import { useState } from 'react';
import { Download, Images } from 'lucide-react';
import type { ToolDefinition } from '@/types/tool';
import { useStore } from '@/storage/store';
import { saveMany, type OutputFile } from '@/conversion/download';
import { outputName } from '@/utils/filename';
import { formatBytes } from '@/utils/format';
import { UserError, throwIfAborted } from '@/utils/errors';
import { t } from '@/i18n';
import { Button, Card, Progress, Segmented } from '@/components/ui/primitives';
import { ErrorState } from '@/components/ui/states';
import { useJob } from './useJob';
import { openForRender, renderPage, canvasToBlob } from './render';
import { usePdfSource, PdfSourceHeader, PageRangeField, rangeOrAll } from './shared';
import { PdfThumbnail } from './PdfThumbnail';

const MAX_PIXELS = 36_000_000; // per page, to stay within canvas limits on most devices

export default function PdfToImageTool({ tool, initialFiles }: { tool: ToolDefinition; initialFiles?: File[] }) {
  const src = usePdfSource(initialFiles);
  const [format, setFormat] = useState<'image/png' | 'image/jpeg'>('image/png');
  const [dpi, setDpi] = useState<'72' | '150' | '300'>('150');
  const [range, setRange] = useState('');
  const job = useJob<OutputFile[]>();
  const useDialog = useStore((s) => s.settings.useSaveDialog);
  const addHistory = useStore((s) => s.addHistory);
  const count = src.source?.pages.length ?? 0;
  const pages = rangeOrAll(range, count);

  const run = async () => {
    if (!src.source || !pages) return;
    const file = src.source.file;
    const scale = Number(dpi) / 72;
    const r = await job.run(async (signal, report) => {
      report(0, 'Loading PDF renderer…');
      const doc = await openForRender(file, file.name);
      const out: OutputFile[] = [];
      try {
        for (let k = 0; k < pages.length; k++) {
          throwIfAborted(signal);
          const i = pages[k];
          report(k / pages.length, `Rendering page ${i + 1} (${k + 1} of ${pages.length})…`);
          const vp = (await doc.getPage(i + 1)).getViewport({ scale });
          const safeScale = vp.width * vp.height > MAX_PIXELS ? scale * Math.sqrt(MAX_PIXELS / (vp.width * vp.height)) : scale;
          const canvas = await renderPage(doc, i, safeScale, { signal });
          const blob = await canvasToBlob(canvas, format, format === 'image/jpeg' ? 0.9 : undefined);
          canvas.width = canvas.height = 0;
          out.push({ name: outputName(file.name, `page-${String(i + 1).padStart(String(count).length, '0')}`, format), blob });
        }
      } finally {
        void doc.destroy();
      }
      if (!out.length) throw new UserError('No pages were rendered.');
      return out;
    });
    if (r) addHistory(tool.id, `${r.length} page${r.length > 1 ? 's' : ''} → ${format === 'image/png' ? 'PNG' : 'JPEG'} at ${dpi} dpi`);
  };

  const total = job.result?.reduce((a, f) => a + f.blob.size, 0) ?? 0;

  return (
    <div className="space-y-4">
      <PdfSourceHeader tool={tool} src={src} />
      {src.source && (
        <div className="grid gap-4 lg:grid-cols-[1fr_300px]">
          <Card className="p-4">
            {src.preview ? (
              <div className="grid grid-cols-3 gap-2 sm:grid-cols-4 xl:grid-cols-6">
                {src.source.pages.map((_, i) => (
                  <div key={i} className={pages && !pages.includes(i) ? 'opacity-30' : ''}>
                    <PdfThumbnail doc={src.preview!} index={i} />
                    <p className="text-center text-xs text-muted">{i + 1}</p>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-sm text-muted">Loading previews…</p>
            )}
          </Card>
          <Card className="h-fit space-y-4 p-4 lg:sticky lg:top-20">
            <Segmented label="Format" value={format} onChange={(v) => (setFormat(v), job.reset())} options={[{ value: 'image/png', label: 'PNG' }, { value: 'image/jpeg', label: 'JPEG' }]} />
            <Segmented label="Resolution" value={dpi} onChange={(v) => (setDpi(v), job.reset())} options={[{ value: '72', label: '72 dpi' }, { value: '150', label: '150 dpi' }, { value: '300', label: '300 dpi' }]} />
            <PageRangeField value={range} onChange={(v) => (setRange(v), job.reset())} pageCount={count} />
            <p className="text-xs text-muted">300 dpi is print quality but uses much more memory. Very large pages are rendered at a reduced resolution to stay within browser limits.</p>
            {job.running ? (
              <div className="space-y-2">
                <Progress value={job.progress} label="Rendering pages" />
                <p className="text-xs text-muted">{job.step}</p>
                <Button onClick={job.cancel} className="w-full justify-center">
                  {t('action.cancel')}
                </Button>
              </div>
            ) : (
              <Button variant="primary" size="lg" className="w-full justify-center" disabled={!pages} onClick={run} icon={<Images size={16} />}>
                Convert {pages?.length ?? 0} page{pages?.length === 1 ? '' : 's'}
              </Button>
            )}
            {job.result && (
              <div className="space-y-2 rounded-md border border-success/30 bg-success/5 p-3 text-sm">
                <p className="font-medium">
                  {job.result.length} image{job.result.length > 1 ? 's' : ''} · {formatBytes(total)}
                </p>
                <Button variant="primary" className="w-full justify-center" icon={<Download size={16} />} onClick={() => saveMany(job.result!, outputName(src.source!.file.name, 'images', 'zip'), { useDialog })}>
                  {job.result.length > 1 ? t('action.downloadAll') : t('action.download')}
                </Button>
              </div>
            )}
          </Card>
        </div>
      )}
      {job.error != null && <ErrorState error={job.error} onRetry={run} />}
    </div>
  );
}
