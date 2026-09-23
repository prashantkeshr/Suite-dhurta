import { useEffect, useState } from 'react';
import { CheckCircle2, XCircle } from 'lucide-react';
import { allCapabilities, deviceMemory, type CapabilityInfo } from '@/capabilities/detect';
import { storageEstimate } from '@/storage/kv';
import { formatBytes } from '@/utils/format';
import { useDocumentMeta } from '@/hooks/useDocumentMeta';
import { t } from '@/i18n';
import { Card } from '@/components/ui/primitives';
import { Breadcrumb, CopyButton, InfoTable } from '@/components/tools/common';

/** Coarse browser/OS labels for display only. Features are always detected directly. */
function describeBrowser(): { browser: string; os: string } {
  const uaData = (navigator as unknown as { userAgentData?: { brands?: { brand: string; version: string }[]; platform?: string } }).userAgentData;
  if (uaData?.brands?.length) {
    const b = uaData.brands.find((x) => !/Not.?A.?Brand|Chromium/i.test(x.brand)) ?? uaData.brands[0];
    return { browser: `${b.brand} ${b.version}`, os: uaData.platform || '—' };
  }
  const ua = navigator.userAgent;
  const m = ua.match(/(Firefox|Edg|OPR|Chrome|Version)\/(\d+)/);
  const name = m ? ({ Edg: 'Edge', OPR: 'Opera', Version: 'Safari' } as Record<string, string>)[m[1]] ?? m[1] : 'Unknown';
  const os = /Windows/.test(ua) ? 'Windows' : /Android/.test(ua) ? 'Android' : /iPhone|iPad/.test(ua) ? 'iOS / iPadOS' : /Mac OS/.test(ua) ? 'macOS' : /Linux/.test(ua) ? 'Linux' : '—';
  return { browser: m ? `${name} ${m[2]}` : name, os };
}

export default function DiagnosticsPage() {
  useDocumentMeta('Browser diagnostics', 'See which browser features are available for local processing.', '/diagnostics');
  const [caps, setCaps] = useState<CapabilityInfo[]>([]);
  const [storage, setStorage] = useState<{ usage?: number; quota?: number }>({});
  const { browser, os } = describeBrowser();
  const mem = deviceMemory();

  useEffect(() => {
    allCapabilities().then(setCaps);
    storageEstimate().then(setStorage);
  }, []);

  const rows: [string, string][] = [
    ['Browser', browser],
    ['Operating system', os],
    ['Screen', `${screen.width} × ${screen.height} @ ${window.devicePixelRatio}x`],
    ['Viewport', `${window.innerWidth} × ${window.innerHeight}`],
    ['Device memory', mem ? `about ${mem} GB (as reported by the browser)` : 'Not exposed by this browser'],
    ['CPU threads', navigator.hardwareConcurrency ? String(navigator.hardwareConcurrency) : 'Not exposed'],
    ['Storage available', storage.quota ? `${formatBytes(storage.usage ?? 0)} used of ${formatBytes(storage.quota)}` : 'Not reported'],
    ['Online', navigator.onLine ? 'Yes' : 'No'],
  ];
  const report = [...rows.map(([k, v]) => `${k}: ${v}`), '', ...caps.map((c) => `${c.supported ? '[x]' : '[ ]'} ${c.label}`)].join('\n');

  return (
    <div className="max-w-3xl">
      <Breadcrumb items={[{ label: t('nav.home'), to: '/' }, { label: t('nav.diagnostics') }]} />
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h1 className="text-2xl font-semibold tracking-tight">Browser diagnostics</h1>
        <CopyButton text={report} label="Copy report" />
      </div>
      <p className="mt-1 text-muted">Everything here is read locally and is not sent anywhere. Use the report when asking for help.</p>

      <Card className="mt-6 p-4 sm:p-5">
        <h2 className="section-title">Environment</h2>
        <InfoTable rows={rows} />
      </Card>

      <Card className="mt-4 p-4 sm:p-5">
        <h2 className="section-title">Features</h2>
        <ul className="grid gap-2 sm:grid-cols-2">
          {caps.map((c) => (
            <li key={c.key} className="flex items-center gap-2 text-sm">
              {c.supported ? <CheckCircle2 size={16} className="shrink-0 text-success" aria-label="Supported" /> : <XCircle size={16} className="shrink-0 text-muted" aria-label="Not supported" />}
              <span className={c.supported ? 'text-fg' : 'text-muted'}>{c.label}</span>
            </li>
          ))}
        </ul>
      </Card>
    </div>
  );
}
