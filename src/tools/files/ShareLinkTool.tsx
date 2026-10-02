import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link2, Lock, Share2, ExternalLink, AlertTriangle, CheckCircle2, X, Download } from 'lucide-react';
import type { ToolDefinition } from '@/types/tool';
import { APP } from '@/app/config';
import { Button, Card, Segmented, Toggle } from '@/components/ui/primitives';
import { FileDropzone } from '@/components/files/FileDropzone';
import { CopyButton, useSaver } from '@/components/tools/common';
import { toast } from '@/components/ui/Toast';
import { useInitialFiles } from '@/hooks/useInitialFiles';
import { useObjectUrl } from '@/hooks/useObjectUrl';
import { useStore } from '@/storage/store';
import { formatBytes } from '@/utils/format';
import { canEncode } from '@/capabilities/detect';
import { encodeFile, MAX_LINK_CHARS } from '@/share/linkCodec';
import { processImage, readImageSize } from '@/tools/image/engine';
import { fitToTarget } from '@/tools/image/targetSize';
import { renderQrSvg, DEFAULT_DESIGN } from '@/tools/generators/qrRender';

type Fit = 'small' | 'chat' | 'original';
/** Image byte budgets: "small" fits a printable QR code only for tiny thumbnails, "chat" suits messaging apps. */
const FIT_BYTES: Record<Exclude<Fit, 'original'>, number> = { small: 12_000, chat: 40_000 };
const QR_MAX_CHARS = 2_300;

const shareBase = () => `${location.origin}${import.meta.env.BASE_URL}open#`;

function lengthAdvice(chars: number): { tone: 'ok' | 'warn' | 'bad'; text: string } {
  if (chars <= QR_MAX_CHARS) return { tone: 'ok', text: 'Short enough for a QR code, SMS-length messages, chat apps and email.' };
  if (chars <= 60_000) return { tone: 'ok', text: 'Fine for WhatsApp, Telegram, email and most chat apps.' };
  if (chars <= 400_000) return { tone: 'warn', text: 'Long link: works in email and when pasted into a browser, but some chat apps may cut it. Open it yourself once to check.' };
  return { tone: 'warn', text: 'Very long link: best sent by email or a notes app. Many chat apps will cut it — reduce the photo or file size if you can.' };
}

export default function ShareLinkTool({ initialFiles }: { tool: ToolDefinition; initialFiles?: File[] }) {
  const addHistory = useStore((s) => s.addHistory);
  const save = useSaver();
  const [mode, setMode] = useState<'file' | 'text'>('file');
  const [file, setFile] = useState<File | null>(null);
  const [text, setText] = useState('');
  const [fit, setFit] = useState<Fit>('chat');
  const [usePassword, setUsePassword] = useState(false);
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [prepared, setPrepared] = useState<File | null>(null);
  const [link, setLink] = useState('');
  const [error, setError] = useState('');

  const isImage = !!file && /^image\/(jpeg|png|webp|bmp|gif|avif)$/.test(file.type);
  const previewUrl = useObjectUrl(isImage ? prepared ?? file : null);

  const take = useCallback((files: File[]) => {
    setFile(files[0] ?? null);
    setMode('file');
    setLink('');
    setPrepared(null);
  }, []);
  useInitialFiles(initialFiles, take);

  useEffect(() => {
    setLink('');
    setError('');
  }, [mode, text, file, fit, usePassword, password]);

  /** Shrink photos to the chosen budget with the same search as "compress to N KB". */
  const prepareImage = async (f: File): Promise<File> => {
    if (fit === 'original') return f;
    const budget = FIT_BYTES[fit];
    if (f.size <= budget) return f;
    const mime = (await canEncode('image/webp')) ? 'image/webp' : 'image/jpeg';
    const dims = await readImageSize(f, f.type);
    const base = Math.min(1, 1600 / Math.max(dims.width, dims.height));
    const out = await fitToTarget(
      async (q, s) => {
        const r = await processImage(f, { resize: { mode: 'percent', percent: base * s * 100 }, rotate: 0, flipH: false, flipV: false, mime, quality: q, background: '#ffffff' }, { inputMime: f.type, useWorker: true, signal: new AbortController().signal, step: () => undefined });
        return { result: r, bytes: r.blob.size };
      },
      budget,
      { minQuality: 0.35 },
    );
    const ext = mime === 'image/webp' ? 'webp' : 'jpg';
    return new File([out.result.blob], f.name.replace(/\.[^.]+$/, '') + '.' + ext, { type: mime });
  };

  const create = async () => {
    setBusy(true);
    setError('');
    try {
      let source: File;
      if (mode === 'text') {
        if (!text.trim()) throw new Error('Write some text first.');
        source = new File([text], 'note.txt', { type: 'text/plain' });
      } else {
        if (!file) throw new Error('Choose a file first.');
        source = isImage ? await prepareImage(file) : file;
      }
      if (usePassword && password.length < 4) throw new Error('Use a password of at least 4 characters.');
      setPrepared(source);
      const payload = await encodeFile({ name: source.name, type: source.type, bytes: new Uint8Array(await source.arrayBuffer()) }, usePassword ? password : undefined);
      const url = shareBase() + payload;
      if (url.length > MAX_LINK_CHARS) throw new Error(`This file makes a ${Math.round(url.length / 1000)}k-character link, which is too long to share reliably. ${isImage ? 'Choose “Chat-friendly” or “Small”.' : 'Compress the file first, or share it another way.'}`);
      setLink(url);
      addHistory('share-link', `${mode === 'text' ? 'Text' : source.name} → link (${Math.round(url.length / 1000)}k characters${usePassword ? ', password' : ''})`);
    } catch (err) {
      setError((err as Error).message || 'The link could not be created.');
    } finally {
      setBusy(false);
    }
  };

  const qrSvg = useMemo(() => {
    if (!link || link.length > QR_MAX_CHARS) return null;
    try {
      return renderQrSvg(link, { ...DEFAULT_DESIGN, ecc: 'L' }, 360).svg;
    } catch {
      return null;
    }
  }, [link]);
  const advice = link ? lengthAdvice(link.length) : null;
  const canShare = typeof navigator.share === 'function';

  return (
    <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
      <Card className="h-fit space-y-4 p-4">
        <Segmented label="Share" value={mode} onChange={setMode} options={[{ value: 'file', label: 'A file or photo' }, { value: 'text', label: 'Text / note' }]} />
        {mode === 'file' ? (
          file ? (
            <div className="flex items-center gap-3 rounded-md border border-line p-2">
              {previewUrl ? <img src={previewUrl} alt="" className="h-14 w-14 rounded object-cover" /> : <Link2 size={20} className="mx-3 text-muted" aria-hidden />}
              <div className="min-w-0 flex-1 text-sm">
                <p className="truncate font-medium">{file.name}</p>
                <p className="text-muted">{formatBytes(file.size)}{prepared && prepared !== file && ` → ${formatBytes(prepared.size)} for the link`}</p>
              </div>
              <Button size="sm" variant="ghost" icon={<X size={14} />} onClick={() => setFile(null)} aria-label="Remove file" />
            </div>
          ) : (
            <FileDropzone onFiles={take} multiple={false} compact acceptLabel="any small file — photos are reduced to fit" />
          )
        ) : (
          <div>
            <label htmlFor="share-text" className="label">
              Text
            </label>
            <textarea id="share-text" className="input min-h-[160px] py-2" value={text} onChange={(e) => setText(e.target.value)} placeholder="A note, a list, an address, code… (any language)" />
          </div>
        )}

        {mode === 'file' && isImage && (
          <Segmented
            label="Photo size in the link"
            value={fit}
            onChange={setFit}
            options={[
              { value: 'chat', label: 'Chat-friendly (≈40 KB)' },
              { value: 'small', label: 'Small (≈12 KB)' },
              { value: 'original', label: 'Original' },
            ]}
          />
        )}

        <div>
          <Toggle checked={usePassword} onChange={setUsePassword} label="Protect with a password" description="AES-256 encryption. Send the password separately (for example, by phone)." />
          {usePassword && <input className="input mt-1" type="text" autoComplete="off" placeholder="Password" aria-label="Password" value={password} onChange={(e) => setPassword(e.target.value)} />}
        </div>

        <Button variant="primary" size="lg" className="w-full justify-center" loading={busy} icon={<Link2 size={16} />} onClick={create}>
          Create link
        </Button>
        {error && (
          <p className="flex gap-2 text-sm text-error">
            <AlertTriangle size={16} className="mt-0.5 shrink-0" /> {error}
          </p>
        )}
        <p className="text-xs text-muted">The file is placed inside the link itself, after “#”. That part is never sent to {APP.name} or any server — the receiver’s browser unpacks it.</p>
      </Card>

      <div className="min-w-0 space-y-3">
        {link ? (
          <Card className="space-y-3 p-4">
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="text-sm font-semibold">Your link</h2>
              {usePassword && (
                <span className="inline-flex items-center gap-1 text-xs text-success">
                  <Lock size={12} /> Password protected
                </span>
              )}
              <span className="text-xs text-muted">{link.length.toLocaleString()} characters</span>
            </div>
            <textarea readOnly className="input h-28 resize-none py-2 font-mono text-xs" value={link} onFocus={(e) => e.currentTarget.select()} aria-label="Share link" />
            {advice && (
              <p className={advice.tone === 'ok' ? 'flex gap-2 text-sm text-success' : 'flex gap-2 text-sm text-warning'}>
                {advice.tone === 'ok' ? <CheckCircle2 size={16} className="mt-0.5 shrink-0" /> : <AlertTriangle size={16} className="mt-0.5 shrink-0" />}
                {advice.text}
              </p>
            )}
            <div className="flex flex-wrap gap-2">
              <CopyButton text={link} label="Copy link" size="md" />
              {canShare && (
                <Button
                  icon={<Share2 size={16} />}
                  onClick={() =>
                    navigator.share({ title: mode === 'text' ? 'Note' : prepared?.name ?? 'File', text: `Open with ${APP.name}`, url: link }).catch((e: DOMException) => {
                      if (e.name !== 'AbortError') toast.error('Sharing failed', 'Copy the link instead.');
                    })
                  }
                >
                  Share…
                </Button>
              )}
              <a href={link} target="_blank" rel="noopener" className="inline-flex h-10 items-center gap-2 rounded-md border border-line bg-surface px-3.5 text-sm font-medium hover:bg-surface2">
                <ExternalLink size={16} /> Test it
              </a>
            </div>
            {qrSvg && (
              <div className="flex items-center gap-4 border-t border-line pt-3">
                <img src={`data:image/svg+xml;charset=utf-8,${encodeURIComponent(qrSvg)}`} alt="QR code of the link" className="h-36 w-36 rounded border border-line bg-white p-1" />
                <div className="space-y-2 text-sm text-muted">
                  <p>Short enough to scan: the whole file is in this QR code.</p>
                  <Button size="sm" icon={<Download size={14} />} onClick={() => save(new Blob([qrSvg], { type: 'image/svg+xml' }), 'shared-file-qr.svg')}>
                    QR (SVG)
                  </Button>
                </div>
              </div>
            )}
          </Card>
        ) : (
          <Card className="space-y-2 p-4 text-sm text-muted">
            <h2 className="text-sm font-semibold text-fg">How it works</h2>
            <ol className="list-decimal space-y-1 pl-5">
              <li>Choose a file or write a note. Photos are reduced so the link stays short.</li>
              <li>Create the link and send it on any app.</li>
              <li>The receiver opens it in {APP.name} to view, download, or continue editing in any tool.</li>
            </ol>
            <p>Good for notes, lists, CSV/JSON, small documents and photos. Large photos, PDFs and videos make links too long to send.</p>
          </Card>
        )}
      </div>
    </div>
  );
}
