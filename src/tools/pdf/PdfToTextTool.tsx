import { useState } from 'react';
import { AlertTriangle, FileText } from 'lucide-react';
import type { ToolDefinition } from '@/types/tool';
import { useStore } from '@/storage/store';
import { outputName } from '@/utils/filename';
import { throwIfAborted } from '@/utils/errors';
import { t } from '@/i18n';
import { Button, Card, Progress, Toggle } from '@/components/ui/primitives';
import { ErrorState } from '@/components/ui/states';
import { TextPanel, CopyButton, DownloadTextButton } from '@/components/tools/common';
import { useJob } from './useJob';
import { openForRender, pageText } from './render';
import { usePdfSource, PdfSourceHeader, PageRangeField, rangeOrAll } from './shared';

interface Extracted {
  pages: { index: number; text: string }[];
}

export default function PdfToTextTool({ tool, initialFiles }: { tool: ToolDefinition; initialFiles?: File[] }) {
  const src = usePdfSource(initialFiles);
  const [range, setRange] = useState('');
  const [markers, setMarkers] = useState(true);
  const job = useJob<Extracted>();
  const addHistory = useStore((s) => s.addHistory);
  const count = src.source?.pages.length ?? 0;
  const pages = rangeOrAll(range, count);

  const run = async () => {
    if (!src.source || !pages) return;
    const file = src.source.file;
    const r = await job.run(async (signal, report) => {
      const doc = await openForRender(file, file.name);
      try {
        const out: Extracted['pages'] = [];
        for (let k = 0; k < pages.length; k++) {
          throwIfAborted(signal);
          report(k / pages.length, `Reading page ${pages[k] + 1}…`);
          out.push({ index: pages[k], text: await pageText(doc, pages[k]) });
        }
        return { pages: out };
      } finally {
        void doc.destroy();
      }
    });
    if (r) addHistory(tool.id, `Extracted text from ${r.pages.length} page${r.pages.length > 1 ? 's' : ''}`);
  };

  const result = job.result;
  const text = result ? result.pages.map((p) => (markers ? `--- Page ${p.index + 1} ---\n${p.text}` : p.text)).join('\n\n') : '';
  const empty = result ? result.pages.filter((p) => !p.text.trim()).map((p) => p.index + 1) : [];

  return (
    <div className="space-y-4">
      <PdfSourceHeader tool={tool} src={src} />
      {src.source && (
        <div className="grid gap-4 lg:grid-cols-[1fr_300px]">
          <div className="min-w-0 space-y-3">
            {result && empty.length > 0 && (
              <div className="flex items-start gap-2 rounded-md border border-warning/30 bg-warning/5 p-3 text-sm">
                <AlertTriangle size={16} className="mt-0.5 shrink-0 text-warning" aria-hidden />
                <p className="text-muted">
                  {empty.length === result.pages.length ? 'No text layer was found.' : `No text on page${empty.length > 1 ? 's' : ''} ${empty.join(', ')}.`} These pages are probably scanned images. Recognising text in images (OCR) is coming later.
                </p>
              </div>
            )}
            <TextPanel
              id="pdf-text"
              label="Extracted text"
              value={text}
              readOnly
              rows={20}
              placeholder="Choose pages and select Extract text."
              actions={
                <>
                  <CopyButton text={text} />
                  <DownloadTextButton text={text} filename={outputName(src.source.file.name, '', 'txt')} />
                </>
              }
            />
          </div>
          <Card className="h-fit space-y-4 p-4 lg:sticky lg:top-20">
            <PageRangeField value={range} onChange={setRange} pageCount={count} />
            <Toggle checked={markers} onChange={setMarkers} label="Add page markers" />
            {job.running ? (
              <div className="space-y-2">
                <Progress value={job.progress} label="Extracting text" />
                <p className="text-xs text-muted">{job.step}</p>
                <Button onClick={job.cancel} className="w-full justify-center">
                  {t('action.cancel')}
                </Button>
              </div>
            ) : (
              <Button variant="primary" size="lg" className="w-full justify-center" disabled={!pages} onClick={run} icon={<FileText size={16} />}>
                Extract text
              </Button>
            )}
            <p className="text-xs text-muted">Reading order follows the PDF’s layout; multi-column pages and tables may come out in a different order.</p>
          </Card>
        </div>
      )}
      {job.error != null && <ErrorState error={job.error} onRetry={run} />}
    </div>
  );
}
