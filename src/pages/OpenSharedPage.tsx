import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { Lock, Download, AlertTriangle, ShieldCheck, FileQuestion } from 'lucide-react';
import { APP } from '@/app/config';
import { decodeFile, isEncrypted, LinkError } from '@/share/linkCodec';
import { saveFile } from '@/conversion/download';
import { useStore } from '@/storage/store';
import { useTray } from '@/filesystem/tray';
import { useDocumentMeta } from '@/hooks/useDocumentMeta';
import { useObjectUrl } from '@/hooks/useObjectUrl';
import { formatBytes } from '@/utils/format';
import { Button, Card } from '@/components/ui/primitives';
import { FileActions } from '@/components/files/FileActions';

const TEXT_TYPES = /^(text\/|application\/(json|xml|csv|javascript))/;

function Preview({ file }: { file: File }) {
  const isImage = /^image\/(png|jpeg|webp|gif|bmp|avif)$/.test(file.type); // SVG is not shown inline: it can contain scripts
  const isPdf = file.type === 'application/pdf';
  const url = useObjectUrl(isImage || isPdf ? file : null);
  const [text, setText] = useState<string | null>(null);
  useEffect(() => {
    if (TEXT_TYPES.test(file.type) || /\.(txt|md|csv|json|tsv|xml|ya?ml)$/i.test(file.name)) void file.slice(0, 300_000).text().then(setText);
  }, [file]);
  if (isImage && url) return <img src={url} alt={file.name} className="mx-auto max-h-[60vh] max-w-full rounded border border-line" />;
  if (isPdf && url) return <iframe src={url} title={file.name} className="h-[60vh] w-full rounded border border-line" />;
  if (text !== null) return <pre className="max-h-[60vh] overflow-auto whitespace-pre-wrap break-words rounded border border-line bg-surface2 p-3 text-sm">{text}</pre>;
  return (
    <div className="flex flex-col items-center gap-2 py-8 text-muted">
      <FileQuestion size={32} aria-hidden />
      <p className="text-sm">No preview for this file type — download it or open it in a tool.</p>
    </div>
  );
}

/** /open#… — unpacks a file that was shared inside a link. Nothing is fetched from a server. */
export default function OpenSharedPage() {
  useDocumentMeta('Open shared file', `Open a file that was shared inside a ${APP.name} link.`, '/open');
  const useDialog = useStore((s) => s.settings.useSaveDialog);
  const payload = useMemo(() => decodeURIComponent(location.hash.slice(1)), []);
  const [password, setPassword] = useState('');
  const [file, setFile] = useState<File | null>(null);
  const [error, setError] = useState<LinkError | null>(null);
  const [busy, setBusy] = useState(false);
  const needsPassword = isEncrypted(payload);

  const open = async (pw?: string) => {
    setBusy(true);
    setError(null);
    try {
      const f = await decodeFile(payload, pw);
      const result = new File([f.bytes as BlobPart], f.name, { type: f.type });
      setFile(result);
      useTray.getState().add([result], 'input');
    } catch (err) {
      setError(err instanceof LinkError ? err : new LinkError('This link could not be opened.', 'invalid'));
    } finally {
      setBusy(false);
    }
  };

  useEffect(() => {
    if (payload && !needsPassword) void open();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  if (!payload)
    return (
      <Card className="mx-auto max-w-xl space-y-3 p-6 text-center">
        <h1 className="text-xl font-semibold">Open a shared file</h1>
        <p className="text-muted">This page opens files that someone shared with you as a {APP.name} link. The link you used has no file in it.</p>
        <Link to="/tools/share-link" className="link">
          Share a file as a link
        </Link>
      </Card>
    );

  return (
    <div className="mx-auto max-w-4xl space-y-4">
      <h1 className="text-xl font-semibold tracking-tight sm:text-2xl">{file ? file.name : 'Shared file'}</h1>
      <p className="flex items-start gap-2 text-sm text-muted">
        <ShieldCheck size={16} className="mt-0.5 shrink-0 text-success" aria-hidden />
        This file was inside the link itself and was unpacked by your browser. It was not downloaded from any server. Only open files from people you trust.
      </p>

      {!file && needsPassword && (
        <Card className="max-w-md space-y-3 p-4">
          <p className="flex items-center gap-2 font-medium">
            <Lock size={16} /> This file is password protected
          </p>
          <form
            className="flex gap-2"
            onSubmit={(e) => {
              e.preventDefault();
              void open(password);
            }}
          >
            <input className="input" type="password" autoFocus placeholder="Password" aria-label="Password" value={password} onChange={(e) => setPassword(e.target.value)} />
            <Button type="submit" variant="primary" loading={busy} disabled={!password}>
              Open
            </Button>
          </form>
        </Card>
      )}

      {error && error.reason !== 'password' && (
        <Card className="space-y-1 border-warning/40 p-4">
          <p className="flex items-center gap-2 font-medium text-warning">
            <AlertTriangle size={16} /> {error.message}
          </p>
          {error.reason === 'truncated' && <p className="text-sm text-muted">Ask the sender to send the link again — by email, or as a smaller file — so that it arrives in one piece.</p>}
        </Card>
      )}

      {file && (
        <>
          <Card className="space-y-3 p-4">
            <p className="text-sm text-muted">
              {formatBytes(file.size)} · {file.type || 'unknown type'}
            </p>
            <Preview file={file} />
            <Button variant="primary" icon={<Download size={16} />} onClick={() => void saveFile(file, file.name, { useDialog })}>
              Download
            </Button>
          </Card>
          <Card className="p-4">
            <h2 className="mb-2 text-sm font-semibold">Edit or convert it</h2>
            <FileActions files={[file]} onClear={() => undefined} compact />
          </Card>
        </>
      )}
    </div>
  );
}
