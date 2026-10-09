import { useCallback, useState } from 'react';
import { Lock, Unlock, Download, Eye, EyeOff, ShieldCheck, AlertTriangle } from 'lucide-react';
import type { ToolDefinition } from '@/types/tool';
import { Button, Card, Progress, Segmented } from '@/components/ui/primitives';
import { FileDropzone } from '@/components/files/FileDropzone';
import { useSaver, ContinueButton } from '@/components/tools/common';
import { useInitialFiles } from '@/hooks/useInitialFiles';
import { formatBytes } from '@/utils/format';
import { encryptFile, decryptFile, isEncryptedContainer, CryptoError, type DecryptedFile } from './fileCrypto';
import { estimateStrength } from './passwordStrength';

type Mode = 'encrypt' | 'decrypt';

export default function FileEncryptTool({ initialFiles }: { tool: ToolDefinition; initialFiles?: File[] }) {
  const [file, setFile] = useState<File | null>(null);
  const [mode, setMode] = useState<Mode>('encrypt');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [show, setShow] = useState(false);
  const [progress, setProgress] = useState<number | null>(null);
  const [result, setResult] = useState<{ blob: Blob; name: string; mode: Mode } | null>(null);
  const [error, setError] = useState('');
  const save = useSaver();

  const take = useCallback(async (files: File[]) => {
    const f = files[0];
    if (!f) return;
    setFile(f);
    setResult(null);
    setError('');
    const head = new Uint8Array(await f.slice(0, 6).arrayBuffer());
    setMode(isEncryptedContainer(head) ? 'decrypt' : 'encrypt');
  }, []);
  useInitialFiles(initialFiles, take);

  const strength = mode === 'encrypt' && password ? estimateStrength(password) : null;

  const run = async () => {
    if (!file) return;
    setError('');
    if (!password) return setError('Enter a password.');
    if (mode === 'encrypt' && password !== confirm) return setError('The two passwords do not match.');
    setProgress(0);
    try {
      const bytes = new Uint8Array(await file.arrayBuffer());
      if (mode === 'encrypt') {
        const input: DecryptedFile = { name: file.name, type: file.type, bytes };
        const blob = await encryptFile(input, password, setProgress);
        setResult({ blob, name: `${file.name}.dsenc`, mode });
      } else {
        const out = await decryptFile(bytes, password, setProgress);
        setResult({ blob: new Blob([out.bytes as BlobPart], { type: out.type }), name: out.name, mode });
      }
    } catch (err) {
      setError(err instanceof CryptoError ? err.message : 'Something went wrong.');
    } finally {
      setProgress(null);
    }
  };

  return (
    <div className="mx-auto max-w-2xl space-y-4">
      <FileDropzone onFiles={take} multiple={false} acceptLabel="any file to encrypt, or a .dsenc file to decrypt" compact={!!file} />
      {file && (
        <Card className="space-y-4 p-4">
          <div className="flex items-center justify-between gap-2 text-sm">
            <span className="truncate font-medium" title={file.name}>
              {file.name}
            </span>
            <span className="shrink-0 text-muted">{formatBytes(file.size)}</span>
          </div>

          <Segmented label="Action" value={mode} onChange={(v) => (setMode(v), setResult(null), setError(''))} options={[{ value: 'encrypt', label: 'Encrypt (lock)' }, { value: 'decrypt', label: 'Decrypt (unlock)' }]} />

          <div>
            <label htmlFor="fe-pw" className="label">
              Password
            </label>
            <div className="relative">
              <input id="fe-pw" className="input pr-10" type={show ? 'text' : 'password'} autoComplete="new-password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="Choose a strong password" />
              <button type="button" onClick={() => setShow(!show)} className="absolute right-2 top-1/2 -translate-y-1/2 rounded p-1.5 text-muted hover:text-fg" aria-label={show ? 'Hide password' : 'Show password'}>
                {show ? <EyeOff size={16} /> : <Eye size={16} />}
              </button>
            </div>
            {strength && (
              <div className="mt-1.5">
                <div className="flex gap-1" aria-hidden>
                  {[0, 1, 2, 3, 4].map((i) => (
                    <span key={i} className={`h-1 flex-1 rounded-full ${i <= strength.score ? ['bg-error', 'bg-error', 'bg-warning', 'bg-success', 'bg-success'][strength.score] : 'bg-surface2'}`} />
                  ))}
                </div>
                <p className="mt-1 text-xs text-muted">
                  {strength.label} — an offline attacker would need about {strength.crackTime} to guess it.
                </p>
              </div>
            )}
          </div>

          {mode === 'encrypt' && (
            <div>
              <label htmlFor="fe-confirm" className="label">
                Confirm password
              </label>
              <input id="fe-confirm" className="input" type={show ? 'text' : 'password'} autoComplete="new-password" value={confirm} onChange={(e) => setConfirm(e.target.value)} />
            </div>
          )}

          {mode === 'encrypt' && (
            <p className="flex gap-2 rounded-md border border-warning/30 bg-warning/5 p-3 text-xs text-muted">
              <AlertTriangle size={15} className="mt-0.5 shrink-0 text-warning" aria-hidden />
              There is no way to recover the file if you forget the password — not by us, not by anyone. Write it down somewhere safe.
            </p>
          )}

          {error && <p className="text-sm text-error">{error}</p>}
          {progress !== null && <Progress value={progress} label={mode === 'encrypt' ? 'Encrypting' : 'Decrypting'} />}

          {!result ? (
            <Button variant="primary" size="lg" className="w-full justify-center" icon={mode === 'encrypt' ? <Lock size={16} /> : <Unlock size={16} />} disabled={progress !== null} onClick={run}>
              {mode === 'encrypt' ? 'Encrypt file' : 'Decrypt file'}
            </Button>
          ) : (
            <div className="space-y-2 rounded-md border border-success/30 bg-success/5 p-3">
              <p className="flex items-center gap-2 text-sm font-medium text-success">
                <ShieldCheck size={16} /> {result.mode === 'encrypt' ? 'Encrypted' : 'Decrypted'} · {formatBytes(result.blob.size)}
              </p>
              <div className="flex flex-wrap gap-2">
                <Button variant="primary" icon={<Download size={16} />} onClick={() => save(result.blob, result.name)}>
                  Download {result.name.length > 24 ? result.name.slice(0, 22) + '…' : result.name}
                </Button>
                {result.mode === 'decrypt' && <ContinueButton size="md" files={[result]} />}
              </div>
            </div>
          )}
          <p className="text-xs text-muted">AES-256-GCM encryption with a key stretched from your password (PBKDF2, 600,000 rounds). Everything happens in your browser — the file and password are never uploaded.</p>
        </Card>
      )}
    </div>
  );
}
