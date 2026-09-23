import { useCallback, useState } from 'react';
import type { ToolDefinition } from '@/types/tool';
import { acceptAttribute, formatLabel } from '@/tools/registry';
import { detectFile, type DetectedFile } from '@/filesystem/detect';
import { useObjectUrl } from '@/hooks/useObjectUrl';
import { formatBytes, aspectRatio, formatNumber } from '@/utils/format';
import { Card } from '@/components/ui/primitives';
import { ErrorState } from '@/components/ui/states';
import { FileDropzone } from '@/components/files/FileDropzone';
import { InfoTable, CopyButton } from '@/components/tools/common';
import { readImageSize } from './engine';
import { useInitialFiles } from '@/hooks/useInitialFiles';

interface Info {
  d: DetectedFile;
  width?: number;
  height?: number;
  error?: unknown;
}

function InfoCard({ info }: { info: Info }) {
  const url = useObjectUrl(info.error ? null : info.d.file);
  const { d, width, height } = info;
  const rows: [string, string][] = [
    ['File name', d.name],
    ['Detected type', `${d.label} (${d.mime})`],
    ['Detected from', d.source === 'content' ? 'file contents' : d.source],
    ['File size', `${formatBytes(d.size)} (${formatNumber(d.size)} bytes)`],
    ...(width && height
      ? ([
          ['Dimensions', `${width} × ${height} px`],
          ['Megapixels', (width * height / 1e6).toFixed(2)],
          ['Aspect ratio', aspectRatio(width, height)],
          ['Orientation', width === height ? 'Square' : width > height ? 'Landscape' : 'Portrait'],
          ['Bytes per pixel', (d.size / (width * height)).toFixed(3)],
        ] as [string, string][])
      : []),
    ['Last modified', d.file.lastModified ? new Date(d.file.lastModified).toLocaleString() : '—'],
  ];
  return (
    <Card className="grid gap-4 p-4 sm:grid-cols-[200px_1fr]">
      <div className="checker flex aspect-square items-center justify-center overflow-hidden rounded-md border border-line">
        {url && <img src={url} alt={`Preview of ${d.name}`} className="max-h-full max-w-full object-contain" />}
      </div>
      <div className="min-w-0 space-y-3">
        {info.error ? <ErrorState error={info.error} /> : <InfoTable rows={rows} />}
        {d.extensionMismatch && <p className="text-sm text-warning">The file extension does not match the actual format.</p>}
        <CopyButton text={rows.map(([k, v]) => `${k}: ${v}`).join('\n')} label="Copy details" />
      </div>
    </Card>
  );
}

export default function ImageInfoTool({ tool, initialFiles }: { tool: ToolDefinition; initialFiles?: File[] }) {
  const [items, setItems] = useState<Info[]>([]);

  const add = useCallback(async (files: File[]) => {
    const infos = await Promise.all(
      files.map(async (file) => {
        const d = await detectFile(file);
        try {
          const size = await readImageSize(file, d.mime);
          return { d, ...size };
        } catch (error) {
          return { d, error };
        }
      }),
    );
    setItems((prev) => [...infos, ...prev]);
  }, []);

  useInitialFiles(initialFiles, add);

  return (
    <div className="space-y-4">
      <FileDropzone onFiles={add} accept={acceptAttribute(tool)} acceptLabel={formatLabel(tool.inputTypes)} compact={items.length > 0} />
      {items.map((info, i) => (
        <InfoCard key={`${info.d.name}-${i}`} info={info} />
      ))}
    </div>
  );
}
