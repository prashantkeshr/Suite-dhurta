import { useMemo, useState } from 'react';
import { AlertTriangle } from 'lucide-react';
import type { ToolDefinition } from '@/types/tool';
import { Card } from '@/components/ui/primitives';
import { TextPanel, CopyButton, InfoTable } from '@/components/tools/common';
import { decodeJwt } from './logic';

const CLAIMS: Record<string, string> = { iss: 'Issuer', sub: 'Subject', aud: 'Audience', exp: 'Expires', nbf: 'Not before', iat: 'Issued at', jti: 'Token ID' };

function time(v: unknown) {
  if (typeof v !== 'number') return String(v);
  const d = new Date(v * 1000);
  const diff = v * 1000 - Date.now();
  const rel = Math.abs(diff) < 86400000 * 2 ? `${Math.round(Math.abs(diff) / 60000)} min` : `${Math.round(Math.abs(diff) / 86400000)} days`;
  return `${d.toLocaleString()} (${diff >= 0 ? 'in ' + rel : rel + ' ago'})`;
}

export default function JwtDecoderTool(_: { tool: ToolDefinition }) {
  const [token, setToken] = useState('');
  const result = useMemo(() => {
    if (!token.trim()) return null;
    try {
      return { jwt: decodeJwt(token) };
    } catch (err) {
      return { error: (err as Error).message };
    }
  }, [token]);

  const jwt = result && 'jwt' in result ? result.jwt : null;
  const exp = jwt?.payload.exp;
  const expired = typeof exp === 'number' && exp * 1000 < Date.now();
  const claimRows = jwt
    ? Object.entries(CLAIMS)
        .filter(([k]) => k in jwt.payload)
        .map(([k, label]) => [`${label} (${k})`, ['exp', 'nbf', 'iat'].includes(k) ? time(jwt.payload[k]) : String(jwt.payload[k])] as [string, string])
    : [];

  return (
    <div className="space-y-4">
      <TextPanel id="jwt-in" label="Token" value={token} onChange={setToken} rows={5} placeholder="eyJhbGciOi…" />
      <div className="flex items-start gap-2 rounded-md border border-warning/30 bg-warning/5 p-3 text-sm">
        <AlertTriangle size={16} className="mt-0.5 shrink-0 text-warning" aria-hidden />
        <p className="text-muted">
          Decoding only reads the token; it does <strong className="text-fg">not verify the signature</strong>. Anyone can create a token with any contents. Avoid pasting production tokens from other people.
        </p>
      </div>
      {result && 'error' in result && (
        <p role="alert" className="text-sm text-error">
          {result.error}
        </p>
      )}
      {jwt && (
        <>
          {claimRows.length > 0 && (
            <Card className="p-4">
              <div className="mb-2 flex items-center gap-2">
                <h2 className="text-sm font-semibold">Claims</h2>
                {typeof exp === 'number' && <span className={expired ? 'text-xs font-semibold text-error' : 'text-xs font-semibold text-success'}>{expired ? 'EXPIRED' : 'NOT EXPIRED'}</span>}
              </div>
              <InfoTable rows={claimRows} />
            </Card>
          )}
          <div className="grid gap-4 md:grid-cols-2">
            {(['header', 'payload'] as const).map((part) => {
              const json = JSON.stringify(jwt[part], null, 2);
              return <TextPanel key={part} id={`jwt-${part}`} label={part === 'header' ? `Header · ${String(jwt.header.alg ?? '')}` : 'Payload'} value={json} readOnly rows={12} actions={<CopyButton text={json} />} />;
            })}
          </div>
        </>
      )}
    </div>
  );
}
