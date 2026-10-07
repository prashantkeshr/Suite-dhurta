import { useCallback, useMemo, useState } from 'react';
import { Download, EyeOff } from 'lucide-react';
import type { ToolDefinition } from '@/types/tool';
import { Button, Card, Toggle } from '@/components/ui/primitives';
import { ErrorState } from '@/components/ui/states';
import { FileDropzone } from '@/components/files/FileDropzone';
import { CopyButton, DownloadTextButton, InfoTable, useSaver, ContinueButton } from '@/components/tools/common';
import { useInitialFiles } from '@/hooks/useInitialFiles';
import { useObjectUrl } from '@/hooks/useObjectUrl';
import { useStore } from '@/storage/store';
import { saveMany } from '@/conversion/download';
import { formatBytes } from '@/utils/format';
import { readPptx, outline, type Presentation, type Media } from './pptx';

const MIME: Record<string, string> = { png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', gif: 'image/gif', bmp: 'image/bmp', svg: 'image/svg+xml', webp: 'image/webp', tif: 'image/tiff', tiff: 'image/tiff', emf: 'image/emf', wmf: 'image/wmf', mp4: 'video/mp4', m4v: 'video/mp4', mov: 'video/quicktime', mp3: 'audio/mpeg', m4a: 'audio/mp4', wav: 'audio/wav' };
const mimeOf = (name: string) => MIME[name.split('.').pop()!.toLowerCase()] ?? 'application/octet-stream';
const toBlob = (m: Media) => new Blob([m.bytes as BlobPart], { type: mimeOf(m.name) });

function MediaThumb({ m }: { m: Media }) {
  const isImage = /^image\/(png|jpeg|gif|bmp|webp)$/.test(mimeOf(m.name));
  const url = useObjectUrl(isImage ? toBlob(m) : null);
  return (
    <div className="checker flex aspect-square items-center justify-center overflow-hidden rounded border border-line text-[11px] text-muted">
      {url ? <img src={url} alt={m.name} className="max-h-full max-w-full object-contain" loading="lazy" /> : m.name.split('.').pop()?.toUpperCase()}
    </div>
  );
}

export default function PresentationTool({ tool, initialFiles }: { tool: ToolDefinition; initialFiles?: File[] }) {
  const [file, setFile] = useState<File | null>(null);
  const [deck, setDeck] = useState<Presentation | null>(null);
  const [error, setError] = useState<unknown>(null);
  const [withNotes, setWithNotes] = useState(true);
  const settings = useStore((s) => s.settings);
  const addHistory = useStore((s) => s.addHistory);
  const save = useSaver();

  const open = useCallback(
    async (files: File[]) => {
      const f = files[0];
      setError(null);
      setDeck(null);
      setFile(f);
      try {
        const p = readPptx(new Uint8Array(await f.arrayBuffer()));
        setDeck(p);
        addHistory(tool.id, `${f.name}: ${p.slides.length} slides, ${p.media.length} media files`);
      } catch (err) {
        setError(err);
      }
    },
    [addHistory, tool.id],
  );
  useInitialFiles(initialFiles, open);

  const text = useMemo(() => (deck ? outline(deck, withNotes) : ''), [deck, withNotes]);
  const base = file?.name.replace(/\.pptx$/i, '') ?? 'presentation';
  const mediaBytes = deck?.media.reduce((a, m) => a + m.bytes.length, 0) ?? 0;

  return (
    <div className="space-y-4">
      <FileDropzone onFiles={open} multiple={false} accept=".pptx,application/vnd.openxmlformats-officedocument.presentationml.presentation" acceptLabel="PowerPoint .pptx" compact={!!deck} />
      {error ? <ErrorState error={error} /> : null}
      {deck && file && (
        <>
          <div className="grid gap-2 sm:grid-cols-4">
            {[
              ['Slides', deck.slides.length],
              ['Hidden slides', deck.slides.filter((s) => s.hidden).length],
              ['Slides with notes', deck.slides.filter((s) => s.notes).length],
              ['Media files', `${deck.media.length} · ${formatBytes(mediaBytes)}`],
            ].map(([k, v]) => (
              <div key={String(k)} className="rounded-lg border border-line bg-surface p-3">
                <p className="text-xs text-muted">{k}</p>
                <p className="text-lg font-semibold tabular-nums">{v}</p>
              </div>
            ))}
          </div>

          <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_340px]">
            <Card className="min-w-0 overflow-hidden">
              <div className="flex flex-wrap items-center justify-between gap-2 border-b border-line px-3 py-2">
                <h2 className="text-sm font-semibold">Slides</h2>
                <div className="flex flex-wrap items-center gap-2">
                  <Toggle checked={withNotes} onChange={setWithNotes} label="Include notes" />
                  <CopyButton text={text} label="Copy all text" />
                  <DownloadTextButton text={text} filename={`${base}.txt`} label="Text" />
                </div>
              </div>
              <ol className="max-h-[560px] divide-y divide-line overflow-auto">
                {deck.slides.map((s) => (
                  <li key={s.index} className="px-3 py-2.5 text-sm">
                    <p className="flex items-center gap-2 font-medium">
                      <span className="text-muted tabular-nums">{s.index}.</span> {s.title || <span className="italic text-muted">No title</span>}
                      {s.hidden && <EyeOff size={13} className="text-muted" aria-label="Hidden slide" />}
                    </p>
                    {s.text.length > 0 && (
                      <ul className="mt-1 list-disc space-y-0.5 pl-9 text-muted">
                        {s.text.slice(0, 12).map((t, i) => (
                          <li key={i}>{t}</li>
                        ))}
                        {s.text.length > 12 && <li>… {s.text.length - 12} more</li>}
                      </ul>
                    )}
                    {withNotes && s.notes && <p className="mt-1 rounded bg-surface2 px-2 py-1 text-xs text-muted">Notes: {s.notes}</p>}
                  </li>
                ))}
              </ol>
            </Card>

            <div className="space-y-4">
              <Card className="space-y-3 p-3">
                <div className="flex items-center justify-between">
                  <h2 className="text-sm font-semibold">Images and media</h2>
                  {deck.media.length > 1 && (
                    <Button size="sm" icon={<Download size={14} />} onClick={() => saveMany(deck.media.map((m) => ({ name: m.name, blob: toBlob(m) })), `${base}-media.zip`, { useDialog: settings.useSaveDialog })}>
                      All (ZIP)
                    </Button>
                  )}
                </div>
                {deck.media.length ? (
                  <>
                    <div className="grid max-h-[320px] grid-cols-4 gap-2 overflow-auto">
                      {deck.media.map((m) => (
                        <button key={m.path} onClick={() => save(toBlob(m), m.name)} title={`${m.name} · ${formatBytes(m.bytes.length)} — click to save`} className="text-left">
                          <MediaThumb m={m} />
                        </button>
                      ))}
                    </div>
                    <ContinueButton files={deck.media.filter((m) => mimeOf(m.name).startsWith('image/')).map((m) => ({ name: m.name, blob: toBlob(m) }))} label="Use images in another tool" />
                  </>
                ) : (
                  <p className="text-sm text-muted">No embedded media.</p>
                )}
              </Card>
              {deck.props.length > 0 && (
                <Card className="p-3">
                  <h2 className="mb-2 text-sm font-semibold">Document properties</h2>
                  <InfoTable rows={deck.props} />
                  <p className="mt-2 text-xs text-muted">Check the author and comments before sharing a file outside your organisation.</p>
                </Card>
              )}
            </div>
          </div>
        </>
      )}
    </div>
  );
}
