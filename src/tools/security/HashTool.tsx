import { useCallback, useEffect, useState } from 'react';
import { CheckCircle2, XCircle } from 'lucide-react';
import type { ToolDefinition } from '@/types/tool';
import { useStore } from '@/storage/store';
import { formatBytes } from '@/utils/format';
import { Card, Progress, Tabs, Toggle } from '@/components/ui/primitives';
import { ErrorState } from '@/components/ui/states';
import { FileDropzone } from '@/components/files/FileDropzone';
import { CopyButton, TextPanel } from '@/components/tools/common';
import { digestHex, type HashAlgo } from './logic';
import { useInitialFiles } from '@/hooks/useInitialFiles';

const ALGOS: HashAlgo[] = ['SHA-1', 'SHA-256', 'SHA-384', 'SHA-512'];

function HashList({ hashes, upper, compare }: { hashes: Partial<Record<HashAlgo, string>>; upper: boolean; compare: string }) {
  const target = compare.trim().toLowerCase();
  return (
    <ul className="space-y-2">
      {ALGOS.map((a) => {
        const h = hashes[a];
        if (!h) return null;
        const shown = upper ? h.toUpperCase() : h;
        const match = target && target === h;
        return (
          <li key={a} className="flex items-start gap-2">
            <span className="w-16 shrink-0 pt-2 text-xs font-medium text-muted">{a}</span>
            <code className={`min-w-0 flex-1 break-all rounded border px-2 py-1.5 font-mono text-[12.5px] ${match ? 'border-success bg-success/10' : 'border-line bg-surface2'}`}>{shown}</code>
            <CopyButton text={shown} />
          </li>
        );
      })}
    </ul>
  );
}

export default function HashTool({ tool, initialFiles }: { tool: ToolDefinition; initialFiles?: File[] }) {
  const [tab, setTab] = useState<'text' | 'file'>(initialFiles?.length ? 'file' : 'text');
  const [text, setText] = useState('');
  const [textHashes, setTextHashes] = useState<Partial<Record<HashAlgo, string>>>({});
  const [files, setFiles] = useState<{ file: File; hashes?: Partial<Record<HashAlgo, string>>; error?: unknown }[]>([]);
  const [busy, setBusy] = useState(false);
  const [upper, setUpper] = useState(false);
  const [compare, setCompare] = useState('');
  const addHistory = useStore((s) => s.addHistory);

  useEffect(() => {
    let alive = true;
    const data = new TextEncoder().encode(text);
    Promise.all(ALGOS.map(async (a) => [a, await digestHex(a, data)] as const)).then((r) => alive && setTextHashes(Object.fromEntries(r)));
    return () => {
      alive = false;
    };
  }, [text]);

  const hashFiles = useCallback(
    async (list: File[]) => {
      setBusy(true);
      const results: { file: File; hashes?: Partial<Record<HashAlgo, string>>; error?: unknown }[] = [];
      for (const file of list) {
        try {
          const buf = await file.arrayBuffer();
          const hashes = Object.fromEntries(await Promise.all(ALGOS.map(async (a) => [a, await digestHex(a, buf)] as const)));
          results.push({ file, hashes });
        } catch (error) {
          results.push({ file, error });
        }
      }
      setFiles((prev) => [...results, ...prev]);
      setBusy(false);
      addHistory(tool.id, `Hashed ${list.length} file${list.length > 1 ? 's' : ''}`);
    },
    [addHistory, tool.id],
  );

  useInitialFiles(initialFiles, hashFiles);

  const target = compare.trim().toLowerCase();
  const allHashes = tab === 'text' ? [textHashes] : files.map((f) => f.hashes ?? {});
  const matched = target && allHashes.some((h) => Object.values(h).includes(target));

  return (
    <div className="space-y-4">
      <Tabs label="Input type" value={tab} onChange={setTab} tabs={[{ id: 'text', label: 'Text' }, { id: 'file', label: 'Files' }]} />
      <div className="flex flex-wrap items-end gap-4">
        <div className="min-w-[240px] flex-1">
          <label htmlFor="cmp" className="label">
            Compare with an expected hash (optional)
          </label>
          <input id="cmp" className="input font-mono" value={compare} onChange={(e) => setCompare(e.target.value)} placeholder="Paste a checksum to verify" spellCheck={false} />
        </div>
        <Toggle checked={upper} onChange={setUpper} label="Uppercase" />
      </div>
      {target && (
        <p className={`flex items-center gap-1.5 text-sm ${matched ? 'text-success' : 'text-error'}`} aria-live="polite">
          {matched ? <CheckCircle2 size={16} aria-hidden /> : <XCircle size={16} aria-hidden />}
          {matched ? 'Match — the hash is identical.' : 'No match with any computed hash.'}
        </p>
      )}

      {tab === 'text' ? (
        <div className="grid gap-4 lg:grid-cols-2">
          <TextPanel id="hash-text" label="Text (UTF-8)" value={text} onChange={setText} rows={10} />
          <Card className="p-4">
            <HashList hashes={textHashes} upper={upper} compare={compare} />
          </Card>
        </div>
      ) : (
        <div className="space-y-4">
          <FileDropzone onFiles={hashFiles} compact={files.length > 0} />
          {busy && <Progress value={null} label="Hashing files" />}
          {files.map((f, i) => (
            <Card key={i} className="p-4">
              <p className="mb-3 truncate text-sm font-medium">
                {f.file.name} <span className="font-normal text-muted">· {formatBytes(f.file.size)}</span>
              </p>
              {f.error ? <ErrorState error={f.error} /> : <HashList hashes={f.hashes ?? {}} upper={upper} compare={compare} />}
            </Card>
          ))}
        </div>
      )}
      <p className="text-xs text-muted">Hashing is a one-way fingerprint, not encryption. SHA-1 is shown for checksum compatibility only; it is not safe for security purposes.</p>
    </div>
  );
}
