import { useCallback, useState } from 'react';
import { Combine, Download, FileText } from 'lucide-react';
import type { ToolDefinition } from '@/types/tool';
import { acceptAttribute, formatLabel } from '@/tools/registry';
import { useStore } from '@/storage/store';
import { formatBytes } from '@/utils/format';
import { t } from '@/i18n';
import { Button, Card, Progress } from '@/components/ui/primitives';
import { ErrorState } from '@/components/ui/states';
import { FileDropzone } from '@/components/files/FileDropzone';
import { SortableFileList } from '@/components/files/SortableFileList';
import { useSaver } from '@/components/tools/common';
import { loadPdf, mergePdfs } from './engine';
import { useJob } from './useJob';
import { useInitialFiles } from '@/hooks/useInitialFiles';

interface Item {
  file: File;
  pages?: number;
  error?: string;
}

export default function PdfMergeTool({ tool, initialFiles }: { tool: ToolDefinition; initialFiles?: File[] }) {
  const [items, setItems] = useState<Item[]>([]);
  const [name, setName] = useState('merged');
  const job = useJob<{ blob: Blob; pages: number }>();
  const save = useSaver();
  const addHistory = useStore((s) => s.addHistory);

  const add = useCallback(async (files: File[]) => {
    const loaded = await Promise.all(
      files.map(async (file): Promise<Item> => {
        try {
          const { pageCount } = await loadPdf(file);
          return { file, pages: pageCount };
        } catch (err) {
          return { file, error: (err as Error).message };
        }
      }),
    );
    setItems((prev) => [...prev, ...loaded]);
  }, []);

  useInitialFiles(initialFiles, add);

  const valid = items.filter((i) => !i.error);
  const totalPages = valid.reduce((a, i) => a + (i.pages ?? 0), 0);

  const merge = async () => {
    const r = await job.run((signal, report) => mergePdfs(valid.map((i) => i.file), signal, (v, s) => report(v, s)));
    if (r) addHistory(tool.id, `${valid.length} PDFs merged (${r.pages} pages)`);
  };

  return (
    <div className="space-y-4">
      <FileDropzone onFiles={add} accept={acceptAttribute(tool)} acceptLabel={formatLabel(tool.inputTypes)} compact={items.length > 0} />

      {items.length > 0 && (
        <div className="grid gap-4 lg:grid-cols-[1fr_300px]">
          <Card className="overflow-hidden">
            <div className="flex items-center justify-between border-b border-line px-4 py-2.5">
              <p className="text-sm font-medium">
                {valid.length} PDF{valid.length === 1 ? '' : 's'} · {totalPages} pages
              </p>
              <p className="hidden text-xs text-muted sm:block">Drag or use the arrows to set the order</p>
            </div>
            <SortableFileList
              items={items}
              onChange={(next) => {
                setItems(next);
                job.reset();
              }}
              label={(i) => i.file.name}
              render={(i) => (
                <div className="flex items-center gap-2">
                  <FileText size={18} className={i.error ? 'shrink-0 text-error' : 'shrink-0 text-muted'} aria-hidden />
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium" title={i.file.name}>
                      {i.file.name}
                    </p>
                    <p className={i.error ? 'text-xs text-error' : 'text-xs text-muted'}>{i.error ?? `${i.pages} page${i.pages === 1 ? '' : 's'} · ${formatBytes(i.file.size)}`}</p>
                  </div>
                </div>
              )}
            />
          </Card>

          <Card className="h-fit space-y-4 p-4 lg:sticky lg:top-20">
            <div>
              <label htmlFor="outname" className="label">
                Output file name
              </label>
              <div className="flex items-center gap-1">
                <input id="outname" className="input" value={name} onChange={(e) => setName(e.target.value)} />
                <span className="text-sm text-muted">.pdf</span>
              </div>
            </div>
            {valid.length < 2 && <p className="text-xs text-muted">Add at least two readable PDFs to merge.</p>}
            {job.running ? (
              <div className="space-y-2">
                <Progress value={job.progress} label="Merging PDFs" />
                <p className="text-xs text-muted">{job.step ?? t('queue.processing')}</p>
                <Button onClick={job.cancel} className="w-full justify-center">
                  {t('action.cancel')}
                </Button>
              </div>
            ) : (
              <Button variant="primary" size="lg" className="w-full justify-center" disabled={valid.length < 2} onClick={merge} icon={<Combine size={16} />}>
                Merge {valid.length} PDFs
              </Button>
            )}
            {job.result && (
              <div className="space-y-2 rounded-md border border-success/30 bg-success/5 p-3 text-sm">
                <p className="font-medium text-fg">
                  Merged: {job.result.pages} pages · {formatBytes(job.result.blob.size)}
                </p>
                <Button variant="primary" className="w-full justify-center" icon={<Download size={16} />} onClick={() => save(job.result!.blob, `${name.trim() || 'merged'}.pdf`)}>
                  {t('action.download')}
                </Button>
              </div>
            )}
          </Card>
        </div>
      )}

      {job.error != null && <ErrorState error={job.error} onRetry={merge} />}
    </div>
  );
}
