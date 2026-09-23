import { useCallback, useState } from 'react';
import { Download, Eraser, X } from 'lucide-react';
import type { ToolDefinition } from '@/types/tool';
import { acceptAttribute, formatLabel } from '@/tools/registry';
import { useStore } from '@/storage/store';
import { outputName } from '@/utils/filename';
import { formatBytes } from '@/utils/format';
import { Button, Card, Progress } from '@/components/ui/primitives';
import { ErrorState } from '@/components/ui/states';
import { FileDropzone } from '@/components/files/FileDropzone';
import { InfoTable, CopyButton, useSaver } from '@/components/tools/common';
import { loadPdf, readInfo, stripMetadata, type PdfInfo } from './engine';
import { useJob } from './useJob';
import { useInitialFiles } from '@/hooks/useInitialFiles';

const PT_PER_MM = 72 / 25.4;
const NAMED: [string, number, number][] = [
  ['A4', 595.28, 841.89],
  ['A3', 841.89, 1190.55],
  ['A5', 419.53, 595.28],
  ['Letter', 612, 792],
  ['Legal', 612, 1008],
];

function pageSizeLabel(w: number, h: number) {
  const [a, b] = [Math.min(w, h), Math.max(w, h)];
  const named = NAMED.find(([, x, y]) => Math.abs(x - a) < 3 && Math.abs(y - b) < 3);
  const mm = `${Math.round(w / PT_PER_MM)} × ${Math.round(h / PT_PER_MM)} mm`;
  return named ? `${named[0]} ${w > h ? 'landscape' : 'portrait'} (${mm})` : mm;
}

export default function PdfMetadataTool({ tool, initialFiles }: { tool: ToolDefinition; initialFiles?: File[] }) {
  const [file, setFile] = useState<File | null>(null);
  const [info, setInfo] = useState<PdfInfo | null>(null);
  const [error, setError] = useState<unknown>(null);
  const job = useJob<Blob>();
  const save = useSaver();
  const addHistory = useStore((s) => s.addHistory);

  const open = useCallback(async (files: File[]) => {
    setError(null);
    try {
      const { doc, file } = await loadPdf(files[0]);
      setFile(file);
      setInfo(readInfo(doc));
    } catch (err) {
      setFile(null);
      setInfo(null);
      setError(err);
    }
  }, []);

  useInitialFiles(initialFiles, open);

  const fmtDate = (d?: Date) => (d && !isNaN(d.getTime()) && d.getTime() > 0 ? d.toLocaleString() : '—');
  const rows: [string, string][] = info
    ? [
        ['Title', info.title || '—'],
        ['Author', info.author || '—'],
        ['Subject', info.subject || '—'],
        ['Keywords', info.keywords || '—'],
        ['Creator app', info.creator || '—'],
        ['Producer', info.producer || '—'],
        ['Created', fmtDate(info.created)],
        ['Modified', fmtDate(info.modified)],
        ['Pages', String(info.pageCount)],
        ['File size', file ? formatBytes(file.size) : '—'],
      ]
    : [];

  // Group consecutive pages with the same size.
  const sizeGroups: { from: number; to: number; label: string }[] = [];
  info?.pages.forEach((p, i) => {
    const label = pageSizeLabel(p.width, p.height) + (p.rotation ? `, rotated ${p.rotation}°` : '');
    const last = sizeGroups[sizeGroups.length - 1];
    if (last && last.label === label && last.to === i - 1) last.to = i;
    else sizeGroups.push({ from: i, to: i, label });
  });

  const strip = async () => {
    if (!file) return;
    const r = await job.run(async (_signal, report) => {
      report(null, 'Removing metadata…');
      const { doc } = await loadPdf(file);
      return stripMetadata(doc);
    });
    if (r) addHistory(tool.id, 'Removed PDF metadata');
  };

  return (
    <div className="space-y-4">
      {!info && <FileDropzone onFiles={open} accept={acceptAttribute(tool)} acceptLabel={formatLabel(tool.inputTypes)} multiple={false} />}
      {error != null && <ErrorState error={error} />}
      {info && file && (
        <div className="grid gap-4 lg:grid-cols-[1fr_300px]">
          <div className="min-w-0 space-y-4">
            <Card className="p-4">
              <div className="mb-3 flex items-center justify-between gap-2">
                <h2 className="truncate text-sm font-semibold">{file.name}</h2>
                <Button size="sm" variant="ghost" icon={<X size={14} />} onClick={() => (setInfo(null), setFile(null), job.reset())}>
                  Change file
                </Button>
              </div>
              <InfoTable rows={rows} />
              <div className="mt-3">
                <CopyButton text={rows.map(([k, v]) => `${k}: ${v}`).join('\n')} label="Copy properties" />
              </div>
            </Card>
            <Card className="p-4">
              <h2 className="section-title">Page sizes</h2>
              <ul className="space-y-1 text-sm">
                {sizeGroups.map((g) => (
                  <li key={g.from} className="flex gap-3">
                    <span className="w-24 shrink-0 text-muted">{g.from === g.to ? `Page ${g.from + 1}` : `Pages ${g.from + 1}–${g.to + 1}`}</span>
                    <span>{g.label}</span>
                  </li>
                ))}
              </ul>
            </Card>
          </div>
          <Card className="h-fit space-y-3 p-4 lg:sticky lg:top-20">
            <h2 className="text-sm font-semibold">Remove metadata</h2>
            <p className="text-xs text-muted">Clears title, author, subject, keywords, creator, producer, dates and the XMP metadata stream. Page content is not changed.</p>
            {job.running ? (
              <Progress value={null} label="Removing metadata" />
            ) : (
              <Button variant="primary" className="w-full justify-center" icon={<Eraser size={16} />} onClick={strip}>
                Remove metadata
              </Button>
            )}
            {job.result && (
              <Button className="w-full justify-center" icon={<Download size={16} />} onClick={() => save(job.result!, outputName(file.name, 'clean', 'pdf'))}>
                Download clean PDF ({formatBytes(job.result.size)})
              </Button>
            )}
            <p className="text-xs text-muted">Hidden data can also exist inside page content, annotations or attachments; this tool does not remove those.</p>
          </Card>
        </div>
      )}
      {job.error != null && <ErrorState error={job.error} onRetry={strip} />}
    </div>
  );
}
