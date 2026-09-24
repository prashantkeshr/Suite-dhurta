import { useEffect, useMemo, useState } from 'react';
import { CheckCircle2, XCircle } from 'lucide-react';
import type { ToolDefinition } from '@/types/tool';
import { Card } from '@/components/ui/primitives';
import { CopyButton, InfoTable, TextPanel } from '@/components/tools/common';
import { parseHeaders, canonicalName, parseUserAgent, SECURITY_HEADERS } from './http';

const SAMPLE = `HTTP/2 200
content-type: text/html; charset=utf-8
strict-transport-security: max-age=31536000; includeSubDomains
x-content-type-options: nosniff
cache-control: public, max-age=600
server: GitHub.com`;

function HeadersView() {
  const [raw, setRaw] = useState(SAMPLE);
  const parsed = useMemo(() => parseHeaders(raw), [raw]);
  const names = new Set(parsed.headers.map((h) => h.name.toLowerCase()));
  const formatted = [parsed.startLine?.text, ...parsed.headers.map((h) => `${canonicalName(h.name)}: ${h.value}`)].filter(Boolean).join('\n');
  const json = JSON.stringify(Object.fromEntries(parsed.headers.map((h) => [canonicalName(h.name), h.value])), null, 2);
  return (
    <div className="space-y-4">
      <div className="grid gap-4 lg:grid-cols-2">
        <TextPanel id="hdr-in" label="Raw headers" value={raw} onChange={setRaw} rows={12} placeholder="Paste headers from DevTools → Network, or curl -I output" />
        <Card className="p-4">
          <div className="mb-2 flex items-center justify-between">
            <h2 className="text-sm font-semibold">
              {parsed.headers.length} header{parsed.headers.length === 1 ? '' : 's'}
              {parsed.startLine && <span className="font-normal text-muted"> · {parsed.startLine.kind === 'response' ? `status ${parsed.startLine.status} ${parsed.startLine.reason ?? ''}` : `${parsed.startLine.method} ${parsed.startLine.path}`}</span>}
            </h2>
            <div className="flex gap-1">
              <CopyButton text={formatted} label="Copy tidy" />
              <CopyButton text={json} label="Copy JSON" />
            </div>
          </div>
          <div className="max-h-72 overflow-auto">
            <InfoTable rows={parsed.headers.map((h) => [canonicalName(h.name), h.value])} />
          </div>
          {parsed.invalid.length > 0 && <p className="mt-2 text-xs text-warning">Ignored {parsed.invalid.length} line(s) that are not valid headers.</p>}
        </Card>
      </div>
      {parsed.startLine?.kind !== 'request' && parsed.headers.length > 0 && (
        <Card className="p-4">
          <h2 className="section-title">Security headers</h2>
          <ul className="grid gap-2 sm:grid-cols-2">
            {SECURITY_HEADERS.map((s) => {
              const ok = names.has(s.name.toLowerCase()) || (s.name === 'X-Frame-Options' && /frame-ancestors/i.test(parsed.headers.find((h) => h.name.toLowerCase() === 'content-security-policy')?.value ?? ''));
              return (
                <li key={s.name} className="flex items-start gap-2 text-sm">
                  {ok ? <CheckCircle2 size={16} className="mt-0.5 shrink-0 text-success" aria-label="Present" /> : <XCircle size={16} className="mt-0.5 shrink-0 text-muted" aria-label="Missing" />}
                  <span>
                    <span className="font-medium">{s.name}</span>
                    <span className="block text-xs text-muted">{s.purpose}</span>
                  </span>
                </li>
              );
            })}
          </ul>
          <p className="mt-3 text-xs text-muted">A quick checklist, not a full security audit. Whether each header is needed depends on the site.</p>
        </Card>
      )}
    </div>
  );
}

interface HighEntropy {
  platform?: string;
  platformVersion?: string;
  architecture?: string;
  model?: string;
  mobile?: boolean;
  fullVersionList?: { brand: string; version: string }[];
}

function UserAgentView() {
  const own = typeof navigator !== 'undefined' ? navigator.userAgent : '';
  const [ua, setUa] = useState(own);
  const [hints, setHints] = useState<HighEntropy | null>(null);
  const info = useMemo(() => parseUserAgent(ua), [ua]);

  useEffect(() => {
    const data = (navigator as unknown as { userAgentData?: { getHighEntropyValues: (k: string[]) => Promise<HighEntropy> } }).userAgentData;
    data
      ?.getHighEntropyValues(['platform', 'platformVersion', 'architecture', 'model', 'fullVersionList'])
      .then(setHints)
      .catch(() => {});
  }, []);

  const brand = hints?.fullVersionList?.find((b) => !/Not.?A.?Brand|Chromium/i.test(b.brand));
  return (
    <div className="space-y-4">
      <TextPanel id="ua-in" label="User-agent string" value={ua} onChange={setUa} rows={3} actions={<CopyButton text={ua} />} />
      {ua !== own && (
        <button className="text-xs text-accent hover:underline" onClick={() => setUa(own)}>
          Use my browser’s user agent
        </button>
      )}
      <div className="grid gap-4 lg:grid-cols-2">
        <Card className="p-4">
          <h2 className="section-title">Parsed from the string</h2>
          <InfoTable
            rows={[
              ['Browser', info.browser ? `${info.browser} ${info.browserVersion ?? ''}` : 'Unknown'],
              ['Engine', info.engine ?? 'Unknown'],
              ['Operating system', info.os ? `${info.os} ${info.osVersion ?? ''}` : 'Unknown'],
              ['Device type', info.device],
            ]}
          />
        </Card>
        {ua === own && hints && (
          <Card className="p-4">
            <h2 className="section-title">Reported by this browser (client hints)</h2>
            <InfoTable
              rows={[
                ['Browser', brand ? `${brand.brand} ${brand.version}` : '—'],
                ['Platform', `${hints.platform ?? '—'} ${hints.platformVersion ?? ''}`],
                ['Architecture', hints.architecture || '—'],
                ['Model', hints.model || '—'],
              ]}
            />
            <p className="mt-2 text-xs text-muted">More accurate than the string above, where the browser supports it. Read locally; nothing is sent anywhere.</p>
          </Card>
        )}
      </div>
      <p className="text-xs text-muted">User-agent strings are easy to fake and modern browsers freeze parts of them (for example Windows 11 still reports “Windows NT 10.0”), so treat this as a best guess.</p>
    </div>
  );
}

export default function HttpToolsTool({ tool }: { tool: ToolDefinition }) {
  return tool.id === 'user-agent' ? <UserAgentView /> : <HeadersView />;
}
