import { useState } from 'react';
import { GitCompare, AlertTriangle } from 'lucide-react';
import type { ToolDefinition } from '@/types/tool';
import { getTool } from '@/tools/registry';
import { useStore } from '@/storage/store';
import { Button, Card } from '@/components/ui/primitives';
import { ErrorState } from '@/components/ui/states';
import { FileDropzone } from '@/components/files/FileDropzone';
import { useInitialFiles } from '@/hooks/useInitialFiles';
import { formatBytes } from '@/utils/format';
import { loadPdf } from './engine';
import { openForRender, pageText } from './render';
import { useJob } from './useJob';
import TextDiffTool from '@/tools/text/TextDiffTool';
import { pageSummary, joinPages } from './compare';

interface Extracted {
  name: string;
  pages: string[];
}


export default function PdfCompareTool({ tool, initialFiles }: { tool: ToolDefinition; initialFiles?: File[] }) {
  const [files, setFiles] = useState<File[]>([]);
  const job = useJob<[Extracted, Extracted]>();
  const addHistory = useStore((s) => s.addHistory);

  const take = (list: File[]) => setFiles((prev) => [...prev, ...list].filter((f) => /pdf$/i.test(f.type) || /\.pdf$/i.test(f.name)).slice(-2));
  useInitialFiles(initialFiles, take);

  const run = async () => {
    const r = await job.run(async (signal, report) => {
      const out: Extracted[] = [];
      for (const [k, f] of files.entries()) {
        await loadPdf(f); // clear errors for encrypted or broken files
        const doc = await openForRender(f, f.name);
        try {
          const pages: string[] = [];
          for (let i = 0; i < doc.numPages; i++) {
            if (signal.aborted) throw new DOMException('Aborted', 'AbortError');
            report((k + i / doc.numPages) / 2, `Reading ${f.name}: page ${i + 1} of ${doc.numPages}`);
            pages.push(await pageText(doc, i));
          }
          out.push({ name: f.name, pages });
        } finally {
          void doc.destroy();
        }
      }
      return [out[0], out[1]] as [Extracted, Extracted];
    });
    if (r) addHistory(tool.id, `${r[0].name} ↔ ${r[1].name}: ${pageSummary(r[0].pages, r[1].pages).length} page(s) differ`);
  };

  const [a, b] = job.result ?? [];
  const summary = a && b ? pageSummary(a.pages, b.pages) : [];
  const noText = a && b && [a, b].some((x) => x.pages.every((p) => !p.trim()));
  const diffTool = getTool('text-diff')!;

  return (
    <div className="space-y-4">
      <Card className="space-y-3 p-4">
        <p className="text-sm text-muted">Add the original PDF first, then the changed version.</p>
        <div className="grid gap-2 sm:grid-cols-2">
          {[0, 1].map((i) => (
            <div key={i} className="rounded-md border border-line p-3 text-sm">
              <p className="text-xs font-semibold uppercase tracking-wide text-muted">{i === 0 ? 'Original' : 'Changed'}</p>
              {files[i] ? (
                <p className="truncate font-medium" title={files[i].name}>
                  {files[i].name} <span className="font-normal text-muted">· {formatBytes(files[i].size)}</span>
                </p>
              ) : (
                <p className="text-muted">Not added yet</p>
              )}
            </div>
          ))}
        </div>
        <FileDropzone onFiles={take} accept="application/pdf,.pdf" acceptLabel="two PDF files" compact />
        <div className="flex flex-wrap gap-2">
          <Button variant="primary" icon={<GitCompare size={16} />} disabled={files.length !== 2 || job.running} loading={job.running} onClick={run}>
            Compare
          </Button>
          {files.length > 0 && (
            <Button
              onClick={() => {
                setFiles([]);
                job.reset();
              }}
            >
              Clear
            </Button>
          )}
          {job.running && job.step && <span className="self-center text-xs text-muted">{job.step}</span>}
        </div>
      </Card>

      {job.error ? <ErrorState error={job.error} onRetry={run} /> : null}

      {a && b && (
        <>
          <Card className="space-y-2 p-4 text-sm">
            <p>
              <strong>{a.pages.length}</strong> page{a.pages.length === 1 ? '' : 's'} vs <strong>{b.pages.length}</strong>.{' '}
              {summary.length === 0 ? <span className="text-success">The text of every page is identical.</span> : <span className="text-warning">{summary.length} page{summary.length === 1 ? ' differs' : 's differ'}:</span>}
            </p>
            {summary.length > 0 && (
              <ul className="flex flex-wrap gap-1.5">
                {summary.map((s) => (
                  <li key={s.page} className="rounded-full border border-line px-2.5 py-0.5 text-xs">
                    Page {s.page}: {s.status === 'changed' ? 'changed' : s.status === 'only-a' ? 'only in original' : 'only in changed'}
                  </li>
                ))}
              </ul>
            )}
            {noText && (
              <p className="flex gap-2 text-warning">
                <AlertTriangle size={16} className="mt-0.5 shrink-0" /> One of the PDFs has no text layer (it is probably a scan), so only its text — none — can be compared.
              </p>
            )}
            <p className="text-xs text-muted">This compares text. Changes to images, colours or layout that do not change the text are not detected.</p>
          </Card>
          <TextDiffTool key={`${a.name}|${b.name}`} tool={diffTool} texts={{ a: joinPages(a.pages), b: joinPages(b.pages), names: [a.name.replace(/\.pdf$/i, '.txt'), b.name.replace(/\.pdf$/i, '.txt')] }} />
        </>
      )}
    </div>
  );
}
