import { useCallback, useState } from 'react';
import { Play, Download, X } from 'lucide-react';
import type { ToolDefinition } from '@/types/tool';
import { Button, Card, Segmented } from '@/components/ui/primitives';
import { FileDropzone } from '@/components/files/FileDropzone';
import { ContinueButton, useSaver } from '@/components/tools/common';
import { toast } from '@/components/ui/Toast';
import { useInitialFiles } from '@/hooks/useInitialFiles';
import { useObjectUrl } from '@/hooks/useObjectUrl';
import { useStore } from '@/storage/store';
import { saveMany, type OutputFile } from '@/conversion/download';
import { outputName } from '@/utils/filename';
import { formatBytes } from '@/utils/format';

type Out = 'image/jpeg' | 'image/png' | 'image/webp';
interface Item {
  file: File;
  status: 'waiting' | 'working' | 'done' | 'error';
  result?: OutputFile;
  error?: string;
}

const isHeicName = (f: File) => /\.(heic|heif)$/i.test(f.name) || /image\/hei[cf]/.test(f.type);

function Thumb({ blob }: { blob?: Blob }) {
  const url = useObjectUrl(blob ?? null);
  return <div className="checker flex h-14 w-14 shrink-0 items-center justify-center overflow-hidden rounded border border-line">{url && <img src={url} alt="" className="max-h-full max-w-full object-contain" />}</div>;
}

export default function HeicTool({ tool, initialFiles }: { tool: ToolDefinition; initialFiles?: File[] }) {
  const [items, setItems] = useState<Item[]>([]);
  const [format, setFormat] = useState<Out>('image/jpeg');
  const [busy, setBusy] = useState(false);
  const settings = useStore((s) => s.settings);
  const addHistory = useStore((s) => s.addHistory);
  const save = useSaver();

  const add = useCallback((files: File[]) => {
    const ok = files.filter(isHeicName);
    if (ok.length < files.length) toast.warning(`${files.length - ok.length} file${files.length - ok.length > 1 ? 's were' : ' was'} skipped`, 'Only .heic and .heif photos can be converted here.');
    setItems((prev) => [...prev, ...ok.map((file) => ({ file, status: 'waiting' as const }))]);
  }, []);
  useInitialFiles(initialFiles, add);

  const convert = async () => {
    setBusy(true);
    // The decoder (libheif, WebAssembly) is downloaded only when it is first needed.
    const { heicTo } = await import('heic-to/csp');
    let done = 0;
    for (let i = 0; i < items.length; i++) {
      if (items[i].status === 'done') continue;
      setItems((list) => list.map((it, k) => (k === i ? { ...it, status: 'working' } : it)));
      try {
        const blob = await heicTo({ blob: items[i].file, type: format, quality: format === 'image/png' ? undefined : settings.defaultQuality });
        const result = { name: outputName(items[i].file.name, '', format), blob };
        setItems((list) => list.map((it, k) => (k === i ? { ...it, status: 'done', result } : it)));
        done++;
      } catch (err) {
        setItems((list) => list.map((it, k) => (k === i ? { ...it, status: 'error', error: 'This photo could not be decoded. It may be damaged or use an unsupported HEIC variant.' } : it)));
        console.error(err);
      }
    }
    setBusy(false);
    if (done) addHistory(tool.id, `${done} HEIC photo${done > 1 ? 's' : ''} → ${format === 'image/jpeg' ? 'JPG' : format === 'image/png' ? 'PNG' : 'WebP'}`);
  };

  const results = items.filter((i) => i.result).map((i) => i.result!);
  return (
    <div className="space-y-4">
      <FileDropzone onFiles={add} accept=".heic,.heif,image/heic,image/heif" acceptLabel="HEIC / HEIF photos from iPhone or iPad" compact={items.length > 0} />
      {items.length > 0 && (
        <div className="grid gap-4 lg:grid-cols-[1fr_300px]">
          <Card className="divide-y divide-line">
            {items.map((it, i) => (
              <div key={i} className="flex items-center gap-3 p-2.5">
                <Thumb blob={it.result?.blob} />
                <div className="min-w-0 flex-1 text-sm">
                  <p className="truncate font-medium">{it.file.name}</p>
                  <p className={it.status === 'error' ? 'text-error' : 'text-muted'}>
                    {formatBytes(it.file.size)}
                    {it.result && ` → ${formatBytes(it.result.blob.size)} ${it.result.name.split('.').pop()?.toUpperCase()}`}
                    {it.status === 'working' && ' · converting…'}
                    {it.error && ` · ${it.error}`}
                  </p>
                </div>
                {it.result && (
                  <Button size="sm" icon={<Download size={14} />} onClick={() => save(it.result!.blob, it.result!.name)}>
                    Save
                  </Button>
                )}
                <Button size="icon" variant="ghost" aria-label={`Remove ${it.file.name}`} onClick={() => setItems(items.filter((_, k) => k !== i))} disabled={busy}>
                  <X size={15} />
                </Button>
              </div>
            ))}
          </Card>
          <Card className="h-fit space-y-3 p-4">
            <Segmented label="Convert to" value={format} onChange={(v) => (setFormat(v), setItems(items.map((it) => ({ file: it.file, status: 'waiting' }))))} options={[{ value: 'image/jpeg', label: 'JPG' }, { value: 'image/png', label: 'PNG' }, { value: 'image/webp', label: 'WebP' }]} />
            <Button variant="primary" size="lg" className="w-full justify-center" icon={<Play size={16} />} loading={busy} disabled={busy || items.every((i) => i.status === 'done')} onClick={convert}>
              Convert {items.filter((i) => i.status !== 'done').length || ''} photo{items.length === 1 ? '' : 's'}
            </Button>
            {results.length > 1 && (
              <Button className="w-full justify-center" icon={<Download size={16} />} onClick={() => saveMany(results, 'converted-photos.zip', { useDialog: settings.useSaveDialog })}>
                Download all (ZIP)
              </Button>
            )}
            {results.length > 0 && <ContinueButton size="md" files={results} />}
            <p className="text-xs text-muted">The first conversion downloads the HEIC decoder (libheif, about 2–3 MB) once. Camera and location details are not copied to the new file.</p>
          </Card>
        </div>
      )}
    </div>
  );
}
