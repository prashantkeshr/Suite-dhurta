import { useCallback, useEffect, useState } from 'react';
import { Download, X } from 'lucide-react';
import type { ToolDefinition } from '@/types/tool';
import { acceptAttribute, formatLabel } from '@/tools/registry';
import { detectFile } from '@/filesystem/detect';
import { useObjectUrl } from '@/hooks/useObjectUrl';
import { useInitialFiles } from '@/hooks/useInitialFiles';
import { useStore } from '@/storage/store';
import { saveMany, type OutputFile } from '@/conversion/download';
import { formatBytes } from '@/utils/format';
import { UserError } from '@/utils/errors';
import { Button, Card, Segmented, Toggle } from '@/components/ui/primitives';
import { ErrorState } from '@/components/ui/states';
import { FileDropzone } from '@/components/files/FileDropzone';
import { CopyButton } from '@/components/tools/common';
import { buildIco } from './ico';

const PNG_SIZES = [
  { size: 16, name: 'favicon-16x16.png' },
  { size: 32, name: 'favicon-32x32.png' },
  { size: 48, name: 'favicon-48x48.png' },
  { size: 180, name: 'apple-touch-icon.png' },
  { size: 192, name: 'android-chrome-192x192.png' },
  { size: 512, name: 'android-chrome-512x512.png' },
];
const ICO_SIZES = [16, 32, 48];

type Fit = 'contain' | 'cover';

/** Render the source into a square canvas of `size` px. */
async function renderSquare(source: ImageBitmap | HTMLImageElement, sw: number, sh: number, size: number, fit: Fit, padding: number, bg: string | null): Promise<Blob> {
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = size;
  const ctx = canvas.getContext('2d')!;
  ctx.imageSmoothingQuality = 'high';
  if (bg) {
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, size, size);
  }
  const inner = size * (1 - padding / 50);
  const off = (size - inner) / 2;
  const f = fit === 'cover' ? Math.max(inner / sw, inner / sh) : Math.min(inner / sw, inner / sh);
  const w = sw * f;
  const h = sh * f;
  ctx.save();
  ctx.beginPath();
  ctx.rect(off, off, inner, inner);
  ctx.clip();
  ctx.drawImage(source, off + (inner - w) / 2, off + (inner - h) / 2, w, h);
  ctx.restore();
  const blob = await new Promise<Blob | null>((r) => canvas.toBlob(r, 'image/png'));
  if (!blob) throw new UserError('The browser could not encode the icon.');
  return blob;
}

async function decode(file: File, mime: string): Promise<{ src: ImageBitmap | HTMLImageElement; w: number; h: number }> {
  if (mime === 'image/svg+xml') {
    const url = URL.createObjectURL(file);
    try {
      const img = new Image();
      img.src = url;
      await img.decode();
      // SVGs without intrinsic size: draw at 512.
      return { src: img, w: img.naturalWidth || 512, h: img.naturalHeight || 512 };
    } finally {
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    }
  }
  const bmp = await createImageBitmap(file);
  return { src: bmp, w: bmp.width, h: bmp.height };
}

const HTML_SNIPPET = `<link rel="icon" href="/favicon.ico" sizes="48x48">
<link rel="icon" type="image/png" sizes="32x32" href="/favicon-32x32.png">
<link rel="icon" type="image/png" sizes="16x16" href="/favicon-16x16.png">
<link rel="apple-touch-icon" href="/apple-touch-icon.png">
<link rel="manifest" href="/site.webmanifest">`;

export default function FaviconTool({ tool, initialFiles }: { tool: ToolDefinition; initialFiles?: File[] }) {
  const [source, setSource] = useState<{ file: File; mime: string } | null>(null);
  const [fit, setFit] = useState<Fit>('contain');
  const [padding, setPadding] = useState(0);
  const [useBg, setUseBg] = useState(false);
  const [bg, setBg] = useState('#ffffff');
  const [appName, setAppName] = useState('My Site');
  const [files, setFiles] = useState<OutputFile[] | null>(null);
  const [error, setError] = useState<unknown>(null);
  const [busy, setBusy] = useState(false);
  const useDialog = useStore((s) => s.settings.useSaveDialog);
  const addHistory = useStore((s) => s.addHistory);
  const srcUrl = useObjectUrl(source?.file);
  const previews = files?.filter((f) => f.name.endsWith('.png')) ?? [];

  const open = useCallback(async (list: File[]) => {
    setError(null);
    const d = await detectFile(list[0]);
    if (d.kind !== 'image' || d.mime === 'image/heic') return setError(new UserError('Choose a PNG, JPEG, WebP or SVG image.', [`This file looks like: ${d.label}`]));
    setSource({ file: d.file, mime: d.mime });
  }, []);
  useInitialFiles(initialFiles, open);

  // Regenerate whenever the source or options change.
  useEffect(() => {
    if (!source) return setFiles(null);
    let alive = true;
    setBusy(true);
    (async () => {
      const { src, w, h } = await decode(source.file, source.mime);
      const background = useBg ? bg : null;
      const out: OutputFile[] = [];
      for (const s of PNG_SIZES) out.push({ name: s.name, blob: await renderSquare(src, w, h, s.size, fit, padding, s.size === 180 && !background ? '#ffffff' : background) });
      const icoParts = await Promise.all(ICO_SIZES.map(async (size) => ({ size, png: new Uint8Array(await (await renderSquare(src, w, h, size, fit, padding, background)).arrayBuffer()) })));
      out.unshift({ name: 'favicon.ico', blob: new Blob([buildIco(icoParts) as BlobPart], { type: 'image/x-icon' }) });
      const manifest = {
        name: appName,
        short_name: appName,
        icons: [
          { src: '/android-chrome-192x192.png', sizes: '192x192', type: 'image/png' },
          { src: '/android-chrome-512x512.png', sizes: '512x512', type: 'image/png' },
        ],
        theme_color: useBg ? bg : '#ffffff',
        background_color: useBg ? bg : '#ffffff',
        display: 'standalone',
      };
      out.push({ name: 'site.webmanifest', blob: new Blob([JSON.stringify(manifest, null, 2)], { type: 'application/manifest+json' }) });
      if ('close' in src) src.close();
      if (alive) setFiles(out);
    })()
      .catch((err) => alive && setError(err))
      .finally(() => alive && setBusy(false));
    return () => void (alive = false);
  }, [source, fit, padding, useBg, bg, appName]);

  return (
    <div className="space-y-4">
      {!source && <FileDropzone onFiles={open} accept={acceptAttribute(tool)} acceptLabel={formatLabel(tool.inputTypes)} multiple={false} />}
      {error != null && <ErrorState error={error} />}
      {source && (
        <div className="grid gap-4 lg:grid-cols-[1fr_300px]">
          <div className="min-w-0 space-y-4">
            <Card className="p-4">
              <div className="mb-3 flex items-center gap-2">
                <div className="checker h-10 w-10 overflow-hidden rounded border border-line">{srcUrl && <img src={srcUrl} alt="" className="h-full w-full object-contain" />}</div>
                <p className="min-w-0 flex-1 truncate text-sm font-medium">{source.file.name}</p>
                <Button size="sm" variant="ghost" icon={<X size={14} />} onClick={() => setSource(null)}>
                  Change image
                </Button>
              </div>
              <p className="label">Preview</p>
              <div className="flex flex-wrap items-end gap-4">
                {previews.map((f) => (
                  <PreviewIcon key={f.name} file={f} />
                ))}
                {busy && <p className="text-sm text-muted">Generating…</p>}
              </div>
            </Card>
            <Card className="p-4">
              <div className="mb-2 flex items-center justify-between">
                <p className="text-sm font-semibold">Add to your site’s &lt;head&gt;</p>
                <CopyButton text={HTML_SNIPPET} />
              </div>
              <pre className="overflow-x-auto rounded bg-surface2 p-3 font-mono text-xs">{HTML_SNIPPET}</pre>
            </Card>
          </div>
          <Card className="h-fit space-y-4 p-4 lg:sticky lg:top-20">
            <Segmented label="Fit" value={fit} onChange={setFit} options={[{ value: 'contain', label: 'Fit whole image' }, { value: 'cover', label: 'Fill square' }]} />
            <div>
              <label htmlFor="fav-pad" className="label">
                Padding: {padding}%
              </label>
              <input id="fav-pad" type="range" min={0} max={30} value={padding} onChange={(e) => setPadding(Number(e.target.value))} className="w-full accent-[rgb(var(--accent))]" />
            </div>
            <Toggle checked={useBg} onChange={setUseBg} label="Solid background" description="Otherwise transparent (the Apple icon always gets a white background)." />
            {useBg && <input type="color" aria-label="Background colour" value={bg} onChange={(e) => setBg(e.target.value)} className="h-10 w-14 cursor-pointer rounded border border-line" />}
            <div>
              <label htmlFor="fav-name" className="label">
                App name (for manifest)
              </label>
              <input id="fav-name" className="input" value={appName} onChange={(e) => setAppName(e.target.value)} />
            </div>
            {files && (
              <>
                <ul className="space-y-1 text-xs text-muted">
                  {files.map((f) => (
                    <li key={f.name} className="flex justify-between gap-2">
                      <span className="truncate font-mono">{f.name}</span>
                      <span>{formatBytes(f.blob.size)}</span>
                    </li>
                  ))}
                </ul>
                <Button
                  variant="primary"
                  size="lg"
                  className="w-full justify-center"
                  icon={<Download size={16} />}
                  onClick={async () => {
                    await saveMany(files, 'favicons.zip', { useDialog });
                    addHistory(tool.id, `Favicon set (${files.length} files)`);
                  }}
                >
                  Download ZIP
                </Button>
              </>
            )}
          </Card>
        </div>
      )}
    </div>
  );
}

function PreviewIcon({ file }: { file: OutputFile }) {
  const url = useObjectUrl(file.blob);
  const size = Number(file.name.match(/(\d+)x\d+/)?.[1] ?? (file.name.startsWith('apple') ? 180 : 32));
  const shown = Math.min(size, 96);
  return (
    <figure className="text-center">
      <div className="checker inline-flex items-center justify-center rounded border border-line p-1">{url && <img src={url} alt="" width={shown} height={shown} style={{ imageRendering: size <= 48 ? 'pixelated' : 'auto' }} />}</div>
      <figcaption className="mt-1 text-[11px] text-muted">{size}px</figcaption>
    </figure>
  );
}
