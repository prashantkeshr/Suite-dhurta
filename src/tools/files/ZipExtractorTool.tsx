import { useCallback, useState } from 'react';
import { Download, File as FileIcon, Folder, X } from 'lucide-react';
import type { ToolDefinition } from '@/types/tool';
import { acceptAttribute, formatLabel } from '@/tools/registry';
import { detectFromBytes } from '@/filesystem/detect';
import { useStore } from '@/storage/store';
import { formatBytes } from '@/utils/format';
import { UserError } from '@/utils/errors';
import { t } from '@/i18n';
import { Button, Card, Progress } from '@/components/ui/primitives';
import { ErrorState } from '@/components/ui/states';
import { FileDropzone } from '@/components/files/FileDropzone';
import { useSaver } from '@/components/tools/common';
import { useInitialFiles } from '@/hooks/useInitialFiles';

interface Entry {
  path: string;
  data: Uint8Array;
  mime: string;
}

/** Reject entry names that try to escape the archive (zip-slip) and normalise separators. */
function safePath(name: string): string | null {
  const p = name.replace(/\\/g, '/').replace(/^\/+/, '');
  if (p.split('/').some((seg) => seg === '..')) return null;
  return p;
}

export default function ZipExtractorTool({ tool, initialFiles }: { tool: ToolDefinition; initialFiles?: File[] }) {
  const [archive, setArchive] = useState<File | null>(null);
  const [entries, setEntries] = useState<Entry[]>([]);
  const [error, setError] = useState<unknown>(null);
  const [busy, setBusy] = useState(false);
  const save = useSaver();
  const addHistory = useStore((s) => s.addHistory);

  const open = useCallback(
    async (files: File[]) => {
      const file = files[0];
      setError(null);
      setBusy(true);
      setEntries([]);
      try {
        const { unzip } = await import('fflate');
        const buf = new Uint8Array(await file.arrayBuffer());
        const unzipped = await new Promise<Record<string, Uint8Array>>((resolve, reject) =>
          unzip(buf, (err, data) => (err ? reject(new UserError('This ZIP archive could not be opened.', ['The file may be damaged, encrypted, or not a ZIP archive'], ['Try opening it with your system’s archive tool'], err)) : resolve(data))),
        );
        const list: Entry[] = [];
        let unsafe = 0;
        for (const [name, data] of Object.entries(unzipped)) {
          if (name.endsWith('/')) continue; // directory entry
          const path = safePath(name);
          if (!path) {
            unsafe++;
            continue;
          }
          list.push({ path, data, mime: detectFromBytes(data.subarray(0, 4096), path).mime });
        }
        list.sort((a, b) => a.path.localeCompare(b.path));
        setArchive(file);
        setEntries(list);
        addHistory(tool.id, `Opened ZIP with ${list.length} files`);
        if (unsafe) setError(new UserError(`${unsafe} entr${unsafe > 1 ? 'ies were' : 'y was'} skipped for safety.`, ['The archive contains paths that point outside the archive (“../”)'], []));
      } catch (err) {
        setArchive(null);
        setError(err);
      } finally {
        setBusy(false);
      }
    },
    [addHistory, tool.id],
  );

  useInitialFiles(initialFiles, open);

  const total = entries.reduce((a, e) => a + e.data.length, 0);
  const blobOf = (e: Entry) => new Blob([e.data as BlobPart], { type: e.mime });

  return (
    <div className="space-y-4">
      {!archive && <FileDropzone onFiles={open} accept={acceptAttribute(tool)} acceptLabel={formatLabel(tool.inputTypes)} multiple={false} />}
      {busy && <Progress value={null} label="Reading archive" />}
      {error != null && <ErrorState error={error} />}
      {archive && (
        <Card className="overflow-hidden">
          <div className="flex flex-wrap items-center gap-2 border-b border-line px-4 py-2.5">
            <p className="min-w-0 flex-1 truncate text-sm font-medium">
              {archive.name} <span className="font-normal text-muted">· {entries.length} files · {formatBytes(total)} uncompressed</span>
            </p>
            <Button size="sm" variant="ghost" icon={<X size={14} />} onClick={() => (setArchive(null), setEntries([]), setError(null))}>
              Close
            </Button>
          </div>
          {entries.length === 0 ? (
            <p className="p-4 text-sm text-muted">This archive contains no files.</p>
          ) : (
            <ul className="max-h-[520px] divide-y divide-line overflow-auto">
              {entries.map((e) => {
                const parts = e.path.split('/');
                const fileName = parts.pop()!;
                return (
                  <li key={e.path} className="flex items-center gap-3 px-4 py-2">
                    <FileIcon size={16} className="shrink-0 text-muted" aria-hidden />
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm">{fileName}</p>
                      {parts.length > 0 && (
                        <p className="flex items-center gap-1 truncate text-xs text-muted">
                          <Folder size={11} aria-hidden /> {parts.join('/')}
                        </p>
                      )}
                    </div>
                    <span className="text-xs text-muted">{formatBytes(e.data.length)}</span>
                    <Button size="sm" icon={<Download size={14} />} onClick={() => save(blobOf(e), fileName)} aria-label={`${t('action.download')} ${e.path}`}>
                      <span className="hidden sm:inline">{t('action.download')}</span>
                    </Button>
                  </li>
                );
              })}
            </ul>
          )}
          {entries.length > 1 && (
            <div className="border-t border-line p-3">
              <p className="text-xs text-muted">Files are downloaded one at a time. Browsers cannot write a folder of files in one step without the File System Access API.</p>
            </div>
          )}
        </Card>
      )}
    </div>
  );
}
