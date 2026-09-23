import { useCallback, useMemo, useState } from 'react';
import { AlertTriangle, Copy as CopyIcon } from 'lucide-react';
import type { ToolDefinition } from '@/types/tool';
import { detectFile, extensionOf, type DetectedFile } from '@/filesystem/detect';
import { toolsForFile } from '@/tools/registry';
import { digestHex } from '@/tools/security/logic';
import { formatBytes, formatNumber } from '@/utils/format';
import { Badge, Card, Progress } from '@/components/ui/primitives';
import { FileDropzone } from '@/components/files/FileDropzone';
import { CopyButton } from '@/components/tools/common';
import { Link } from 'react-router-dom';
import { useInitialFiles } from '@/hooks/useInitialFiles';

interface Row {
  d: DetectedFile;
  sha256?: string;
  hashError?: string;
}

const HASH_LIMIT = 512 * 1024 * 1024;

export default function FileInfoTool({ initialFiles }: { tool: ToolDefinition; initialFiles?: File[] }) {
  const [rows, setRows] = useState<Row[]>([]);
  const [hashing, setHashing] = useState(0);

  const add = useCallback(async (files: File[]) => {
    const detected = await Promise.all(files.map(detectFile));
    setRows((prev) => [...prev, ...detected.map((d) => ({ d }))]);
    setHashing((n) => n + detected.length);
    // Hash one at a time to keep memory use bounded.
    for (const d of detected) {
      let patch: Partial<Row>;
      if (d.size > HASH_LIMIT) patch = { hashError: `Skipped: over ${formatBytes(HASH_LIMIT)}` };
      else {
        try {
          patch = { sha256: await digestHex('SHA-256', await d.file.arrayBuffer()) };
        } catch {
          patch = { hashError: 'Could not read file' };
        }
      }
      setRows((prev) => prev.map((r) => (r.d === d ? { ...r, ...patch } : r)));
      setHashing((n) => n - 1);
    }
  }, []);

  useInitialFiles(initialFiles, add);

  const duplicates = useMemo(() => {
    const groups = new Map<string, Row[]>();
    rows.forEach((r) => r.sha256 && groups.set(r.sha256, [...(groups.get(r.sha256) ?? []), r]));
    return [...groups.values()].filter((g) => g.length > 1);
  }, [rows]);
  const dupHashes = new Set(duplicates.map((g) => g[0].sha256));
  const total = rows.reduce((a, r) => a + r.d.size, 0);

  return (
    <div className="space-y-4">
      <FileDropzone onFiles={add} compact={rows.length > 0} />
      {rows.length > 0 && (
        <>
          <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-muted">
            <span>
              {rows.length} file{rows.length > 1 ? 's' : ''} · {formatBytes(total)} total
            </span>
            {duplicates.length > 0 && (
              <span className="inline-flex items-center gap-1 text-warning">
                <CopyIcon size={14} aria-hidden /> {duplicates.reduce((a, g) => a + g.length - 1, 0)} duplicate{duplicates.length > 1 ? 's' : ''} found (identical contents)
              </span>
            )}
            <button className="ml-auto text-xs hover:text-fg" onClick={() => setRows([])}>
              Clear
            </button>
          </div>
          {hashing > 0 && <Progress value={null} label="Computing SHA-256" />}
          <div className="space-y-3">
            {rows.map((r, i) => {
              const actions = toolsForFile(r.d.mime, r.d.name).filter((t) => !t.inputTypes.includes('*/*')).slice(0, 5);
              return (
                <Card key={i} className="p-4">
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="min-w-0 flex-1 truncate font-medium" title={r.d.name}>
                      {r.d.name}
                    </p>
                    {r.sha256 && dupHashes.has(r.sha256) && <Badge tone="warning">Duplicate</Badge>}
                    {r.d.extensionMismatch && (
                      <Badge tone="warning">
                        <AlertTriangle size={11} aria-hidden /> Extension mismatch
                      </Badge>
                    )}
                    {r.d.empty && <Badge tone="error">Empty</Badge>}
                  </div>
                  <dl className="mt-3 grid gap-x-6 gap-y-1.5 text-sm sm:grid-cols-2">
                    {[
                      ['Detected type', `${r.d.label}`],
                      ['MIME type', r.d.mime],
                      ['Detected from', r.d.source === 'content' ? 'file contents (magic bytes)' : r.d.source === 'extension' ? 'file extension' : r.d.source],
                      ['Extension', extensionOf(r.d.name) ? `.${extensionOf(r.d.name)}` : '(none)'],
                      ['Browser-reported type', r.d.file.type || '(none)'],
                      ['Size', `${formatBytes(r.d.size)} (${formatNumber(r.d.size)} bytes)`],
                      ['Last modified', r.d.file.lastModified ? new Date(r.d.file.lastModified).toLocaleString() : '—'],
                      ['Name length', `${Array.from(r.d.name).length} characters`],
                    ].map(([k, v]) => (
                      <div key={k} className="flex gap-2">
                        <dt className="w-40 shrink-0 text-muted">{k}</dt>
                        <dd className="min-w-0 break-all">{v}</dd>
                      </div>
                    ))}
                  </dl>
                  <div className="mt-2 flex items-center gap-2 text-sm">
                    <span className="w-40 shrink-0 text-muted">SHA-256</span>
                    {r.sha256 ? (
                      <>
                        <code className="min-w-0 flex-1 truncate font-mono text-xs" title={r.sha256}>
                          {r.sha256}
                        </code>
                        <CopyButton text={r.sha256} />
                      </>
                    ) : (
                      <span className="text-muted">{r.hashError ?? 'Computing…'}</span>
                    )}
                  </div>
                  {actions.length > 0 && (
                    <p className="mt-3 text-xs text-muted">
                      Open with:{' '}
                      {actions.map((a, j) => (
                        <span key={a.id}>
                          {j > 0 && ' · '}
                          <Link to={`/tools/${a.id}`} className="link">
                            {a.actionLabel ?? a.name}
                          </Link>
                        </span>
                      ))}
                    </p>
                  )}
                </Card>
              );
            })}
          </div>
        </>
      )}
    </div>
  );
}
