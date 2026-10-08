import { useCallback, useState } from 'react';
import { MapPin, ShieldAlert, ShieldCheck, Eraser, Download, ExternalLink } from 'lucide-react';
import type { ToolDefinition } from '@/types/tool';
import { Button, Card, Badge } from '@/components/ui/primitives';
import { FileDropzone } from '@/components/files/FileDropzone';
import { InfoTable, CopyButton, useSaver, ContinueButton } from '@/components/tools/common';
import { toast } from '@/components/ui/Toast';
import { useInitialFiles } from '@/hooks/useInitialFiles';
import { useObjectUrl } from '@/hooks/useObjectUrl';
import { formatBytes } from '@/utils/format';
import { outputName } from '@/utils/filename';
import { readMetadata, stripMetadata, canStripLosslessly, type ImageMetadata } from './metadata';

interface Loaded {
  file: File;
  meta: ImageMetadata;
  cleaned?: { blob: Blob; name: string };
}

export default function ImageMetadataTool({ initialFiles }: { tool: ToolDefinition; initialFiles?: File[] }) {
  const [item, setItem] = useState<Loaded | null>(null);
  const [busy, setBusy] = useState(false);
  const save = useSaver();
  const url = useObjectUrl(item ? item.file : null);

  const open = useCallback(async (files: File[]) => {
    const file = files[0];
    if (!file) return;
    const bytes = new Uint8Array(await file.arrayBuffer());
    setItem({ file, meta: readMetadata(bytes) });
  }, []);
  useInitialFiles(initialFiles, open);

  const remove = async () => {
    if (!item) return;
    setBusy(true);
    try {
      const bytes = new Uint8Array(await item.file.arrayBuffer());
      let blob: Blob;
      if (canStripLosslessly(bytes)) {
        blob = new Blob([stripMetadata(bytes)! as BlobPart], { type: item.file.type });
      } else {
        // WebP and others: redraw through a canvas, which carries no metadata.
        const bmp = await createImageBitmap(item.file);
        const canvas = document.createElement('canvas');
        canvas.width = bmp.width;
        canvas.height = bmp.height;
        canvas.getContext('2d')!.drawImage(bmp, 0, 0);
        bmp.close();
        blob = await new Promise<Blob>((res, rej) => canvas.toBlob((b) => (b ? res(b) : rej(new Error('encode failed'))), item.file.type || 'image/png', 0.95));
      }
      setItem({ ...item, cleaned: { blob, name: outputName(item.file.name, 'no-metadata', item.file.type) } });
      toast.success('Metadata removed', `${formatBytes(item.file.size)} → ${formatBytes(blob.size)}`);
    } catch {
      toast.error('Could not clean this image.');
    } finally {
      setBusy(false);
    }
  };

  const sensitive = item?.meta.fields.filter((f) => f.sensitive) ?? [];
  const lossless = item && (item.meta.format === 'jpeg' || item.meta.format === 'png');

  return (
    <div className="space-y-4">
      <FileDropzone onFiles={open} multiple={false} accept="image/jpeg,image/png,image/webp,.jpg,.jpeg,.png,.webp" acceptLabel="JPEG, PNG or WebP photo" compact={!!item} />
      {item && (
        <div className="grid gap-4 lg:grid-cols-[300px_1fr]">
          <div className="space-y-3">
            <div className="checker flex aspect-square items-center justify-center overflow-hidden rounded-lg border border-line">{url && <img src={url} alt={item.file.name} className="max-h-full max-w-full object-contain" />}</div>
            <p className="truncate text-sm font-medium" title={item.file.name}>
              {item.file.name}
            </p>
            <p className="text-xs text-muted">{formatBytes(item.file.size)}</p>
          </div>

          <div className="min-w-0 space-y-4">
            {item.meta.hasMetadata ? (
              <Card className="border-warning/30 p-4">
                <p className="flex items-center gap-2 text-sm font-semibold text-warning">
                  <ShieldAlert size={16} /> This photo carries {item.meta.fields.length} piece{item.meta.fields.length > 1 ? 's' : ''} of hidden metadata
                </p>
                {sensitive.length > 0 && (
                  <p className="mt-1 text-sm text-muted">
                    Including {sensitive.length} that can identify you or where the photo was taken:{' '}
                    {sensitive.map((f, i) => (
                      <span key={f.tag}>
                        {i > 0 && ', '}
                        <strong className="text-fg">{f.tag}</strong>
                      </span>
                    ))}
                    . Remove it before posting the photo publicly.
                  </p>
                )}
                {item.meta.gps && (
                  <a href={`https://www.openstreetmap.org/?mlat=${item.meta.gps.lat}&mlon=${item.meta.gps.lon}&zoom=15`} target="_blank" rel="noopener noreferrer nofollow" className="mt-2 inline-flex items-center gap-1.5 text-sm font-medium text-accent hover:underline">
                    <MapPin size={14} /> See where this photo says it was taken <ExternalLink size={12} />
                  </a>
                )}
              </Card>
            ) : (
              <Card className="border-success/30 p-4">
                <p className="flex items-center gap-2 text-sm font-semibold text-success">
                  <ShieldCheck size={16} /> No EXIF, GPS or other metadata found
                </p>
                <p className="mt-1 text-sm text-muted">This photo does not appear to carry location, camera or personal information. {item.meta.format === 'webp' && 'WebP metadata reading is limited; re-save below to be sure.'}</p>
              </Card>
            )}

            {item.meta.fields.length > 0 && (
              <Card className="p-4">
                <div className="mb-2 flex items-center justify-between">
                  <h2 className="text-sm font-semibold">All metadata</h2>
                  <CopyButton text={item.meta.fields.map((f) => `${f.tag}: ${f.value}`).join('\n')} label="Copy" />
                </div>
                <InfoTable rows={item.meta.fields.map((f) => [f.tag, <span className={f.sensitive ? 'text-warning' : ''}>{f.value}{f.sensitive && <Badge tone="warning" className="ml-2">personal</Badge>}</span>])} />
              </Card>
            )}

            <Card className="space-y-3 p-4">
              <h2 className="text-sm font-semibold">Remove metadata</h2>
              <p className="text-sm text-muted">{lossless ? 'A clean copy is made without re-compressing the picture — the image quality is identical.' : 'This format is re-saved to drop metadata, which may slightly change the file.'}</p>
              {!item.cleaned ? (
                <Button variant="primary" icon={<Eraser size={16} />} loading={busy} onClick={remove}>
                  Remove all metadata
                </Button>
              ) : (
                <div className="space-y-2 rounded-md border border-success/30 bg-success/5 p-3">
                  <p className="text-sm font-medium text-success">Clean copy ready · {formatBytes(item.cleaned.blob.size)}</p>
                  <div className="flex flex-wrap gap-2">
                    <Button variant="primary" icon={<Download size={16} />} onClick={() => save(item.cleaned!.blob, item.cleaned!.name)}>
                      Download clean photo
                    </Button>
                    <ContinueButton size="md" files={[item.cleaned]} />
                  </div>
                </div>
              )}
              <p className="text-xs text-muted">Everything happens in your browser — the photo is never uploaded.</p>
            </Card>
          </div>
        </div>
      )}
    </div>
  );
}
