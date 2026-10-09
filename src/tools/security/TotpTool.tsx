import { useCallback, useEffect, useRef, useState } from 'react';
import { Copy, Check, Upload, AlertTriangle } from 'lucide-react';
import type { ToolDefinition } from '@/types/tool';
import { Card, Select } from '@/components/ui/primitives';
import { toast } from '@/components/ui/Toast';
import { PickFileButton } from '@/tools/generators/ui';
import { decodeImageFile } from '@/tools/generators/raster';
import { base32Decode, totp, secondsRemaining, parseOtpauth, type Algo, type TotpOptions } from './totp';

export default function TotpTool(_: { tool: ToolDefinition }) {
  const [secret, setSecret] = useState('');
  const [opts, setOpts] = useState<TotpOptions>({ digits: 6, period: 30, algorithm: 'SHA-1' });
  const [label, setLabel] = useState('');
  const [code, setCode] = useState('');
  const [left, setLeft] = useState(30);
  const [error, setError] = useState('');
  const [copied, setCopied] = useState(false);
  const secretBytes = useRef<Uint8Array | null>(null);

  // Parse the secret (plain Base32 or otpauth URI) whenever it changes.
  useEffect(() => {
    setError('');
    const raw = secret.trim();
    if (!raw) {
      secretBytes.current = null;
      setCode('');
      return;
    }
    try {
      if (/^otpauth:/i.test(raw)) {
        const p = parseOtpauth(raw);
        if (!p) throw new Error('bad uri');
        secretBytes.current = p.secret;
        setOpts(p.options);
        setLabel([p.issuer, p.label].filter(Boolean).join(' · '));
      } else {
        secretBytes.current = base32Decode(raw);
        setLabel('');
      }
    } catch {
      secretBytes.current = null;
      setCode('');
      setError('That secret is not valid. Paste the Base32 key your service shows, or an otpauth:// link.');
    }
  }, [secret]);

  // Recompute the code each second.
  useEffect(() => {
    let alive = true;
    const tick = async () => {
      if (!secretBytes.current) return;
      try {
        if (alive) setCode(await totp(secretBytes.current, Date.now(), opts));
        if (alive) setLeft(secondsRemaining(Date.now(), opts.period));
      } catch {
        /* ignore */
      }
    };
    void tick();
    const h = setInterval(tick, 1000);
    return () => {
      alive = false;
      clearInterval(h);
    };
  }, [opts, secret]);

  const fromImage = useCallback(async (file: File) => {
    try {
      const found = await decodeImageFile(file);
      const otp = found.map((f) => f.text).find((t) => /^otpauth:/i.test(t));
      if (otp) setSecret(otp);
      else toast.warning('No 2FA QR code found', 'The image did not contain an otpauth QR code.');
    } catch {
      toast.error('Could not read that image.');
    }
  }, []);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(code);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      toast.error('Copy failed.');
    }
  };

  const ok = !!secretBytes.current && !!code;
  const pct = ok ? (left / (opts.period ?? 30)) * 100 : 0;

  return (
    <div className="mx-auto max-w-2xl space-y-4">
      <Card className="space-y-3 p-4">
        <div>
          <label htmlFor="totp-secret" className="label">
            2FA secret key, or an otpauth:// link
          </label>
          <input id="totp-secret" className="input font-mono" autoComplete="off" spellCheck={false} value={secret} onChange={(e) => setSecret(e.target.value)} placeholder="e.g. JBSWY3DPEHPK3PXP" />
          {error && <p className="mt-1 text-sm text-error">{error}</p>}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <PickFileButton accept="image/png,image/jpeg,image/webp" onFile={fromImage}>
            <Upload size={16} aria-hidden /> Scan a QR code image
          </PickFileButton>
          <span className="text-xs text-muted">Choose a screenshot of the 2FA QR code.</span>
        </div>
      </Card>

      {ok && (
        <Card className="space-y-3 p-5 text-center">
          {label && <p className="text-sm text-muted">{label}</p>}
          <div className="flex items-center justify-center gap-4">
            <p className="font-mono text-4xl font-semibold tabular-nums tracking-[0.15em] text-fg">{code.replace(/(\d{3})(\d+)/, '$1 $2')}</p>
            <button onClick={copy} className="rounded-md border border-line p-2.5 text-muted hover:text-fg" aria-label="Copy code">
              {copied ? <Check size={18} className="text-success" /> : <Copy size={18} />}
            </button>
          </div>
          <div className="mx-auto h-1.5 w-48 overflow-hidden rounded-full bg-surface2" role="img" aria-label={`${left} seconds remaining`}>
            <div className={`h-full rounded-full transition-[width] duration-1000 ease-linear ${left <= 5 ? 'bg-error' : 'bg-accent'}`} style={{ width: `${pct}%` }} />
          </div>
          <p className="text-xs text-muted">New code in {left}s</p>
        </Card>
      )}

      {ok && (
        <div className="grid grid-cols-3 gap-2">
          <Select label="Digits" value={String(opts.digits)} onChange={(e) => setOpts({ ...opts, digits: Number(e.target.value) })} options={[{ value: '6', label: '6' }, { value: '7', label: '7' }, { value: '8', label: '8' }]} />
          <Select label="Period (s)" value={String(opts.period)} onChange={(e) => setOpts({ ...opts, period: Number(e.target.value) })} options={[{ value: '30', label: '30' }, { value: '60', label: '60' }]} />
          <Select label="Algorithm" value={opts.algorithm!} onChange={(e) => setOpts({ ...opts, algorithm: e.target.value as Algo })} options={[{ value: 'SHA-1', label: 'SHA-1' }, { value: 'SHA-256', label: 'SHA-256' }, { value: 'SHA-512', label: 'SHA-512' }]} />
        </div>
      )}

      <p className="flex gap-2 text-xs text-muted">
        <AlertTriangle size={14} className="mt-0.5 shrink-0" />
        The secret stays in this browser tab and is not saved or sent anywhere — closing the tab forgets it. This is handy as a backup, but for everyday use keep 2FA on a separate device from the one you log in with. Your computer’s clock must be accurate.
      </p>
    </div>
  );
}
