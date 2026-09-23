import { useCallback, useState } from 'react';
import { FileArchive, File as FileIcon, X } from 'lucide-react';
import type { ToolDefinition } from '@/types/tool';
import { useStore } from '@/storage/store';
import { zipFiles } from '@/conversion/download';
import { formatBytes, percentChange } from '@/utils/format';
import { t } from '@/i18n';
import { Button, Card, Progress } from '@/components/ui/primitives';
import { ErrorState } from '@/components/ui/states';
import { FileDropzone } from '@/components/files/FileDropzone';
import { useSaver } from '@/components/tools/common';
import { useJob } from '@/tools/pdf/useJob';
import { useInitialFiles } from '@/hooks/useInitialFiles';

export default function ZipCreatorTool({ tool, initialFiles }: { tool: ToolDefinition; initialFiles?: File[] }) {
  const [files, setFiles] = useState<File[]>([]);
  const [name, setName] = useState('archive');
  const job = useJob<Blob>();
  const save = useSaver();
  const addHistory = useStore((s) => s.addHistory);

  const add = useCallback((list: File[]) => {
    setFiles((prev) => [...prev, ...list]);
  }, []);
  useInitialFiles(initialFiles, add);

  const total = files.reduce((a, f) => a + f.size, 0);

  const create = async () => {
    const r = await job.run(async (_s, report) => {
      report(null, 'Compressing…');
      return zipFiles(files.map((f) => ({ name: (f as File & { webkitRelativePath?: string }).webkitRelativePath || f.name, blob: f })));
    });
    if (r) addHistory(tool.id, `${files.length} files → ZIP`);
  };

  return (
    <div className="space-y-4">
      <FileDropzone onFiles={add} compact={files.length > 0} />
      {files.length > 0 && (
        <div className="grid gap-4 lg:grid-cols-[1fr_300px]">
          <Card className="overflow-hidden">
            <div className="flex items-center justify-between border-b border-line px-4 py-2.5 text-sm font-medium">
              <span>
                {files.length} file{files.length > 1 ? 's' : ''} · {formatBytes(total)}
              </span>
              <Button size="sm" variant="ghost" onClick={() => (setFiles([]), job.reset())}>
                {t('action.clear')}
              </Button>
            </div>
            <ul className="max-h-[420px] divide-y divide-line overflow-auto">
              {files.map((f, i) => (
                <li key={i} className="flex items-center gap-3 px-4 py-2">
                  <FileIcon size={16} className="shrink-0 text-muted" aria-hidden />
                  <span className="min-w-0 flex-1 truncate text-sm">{f.name}</span>
                  <span className="text-xs text-muted">{formatBytes(f.size)}</span>
                  <button onClick={() => (setFiles(files.filter((_, j) => j !== i)), job.reset())} aria-label={`${t('action.remove')} ${f.name}`} className="flex h-8 w-8 items-center justify-center rounded text-muted hover:bg-surface2 hover:text-fg">
                    <X size={14} />
                  </button>
                </li>
              ))}
            </ul>
          </Card>
          <Card className="h-fit space-y-3 p-4">
            <div>
              <label htmlFor="zipname" className="label">
                Archive name
              </label>
              <div className="flex items-center gap-1">
                <input id="zipname" className="input" value={name} onChange={(e) => setName(e.target.value)} />
                <span className="text-sm text-muted">.zip</span>
              </div>
            </div>
            {job.running ? (
              <Progress value={null} label="Creating ZIP" />
            ) : (
              <Button variant="primary" size="lg" className="w-full justify-center" icon={<FileArchive size={16} />} onClick={create}>
                Create ZIP
              </Button>
            )}
            {job.result && (
              <div className="space-y-2 rounded-md border border-success/30 bg-success/5 p-3 text-sm">
                <p>
                  {formatBytes(total)} → <strong>{formatBytes(job.result.size)}</strong> ({percentChange(total, job.result.size)})
                </p>
                <Button className="w-full justify-center" onClick={() => save(job.result!, `${name.trim() || 'archive'}.zip`)}>
                  {t('action.download')}
                </Button>
              </div>
            )}
            <p className="text-xs text-muted">Images, PDFs and other already-compressed files are stored without re-compression, so they will not shrink much.</p>
          </Card>
        </div>
      )}
      {job.error != null && <ErrorState error={job.error} onRetry={create} />}
    </div>
  );
}
