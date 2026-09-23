import { useMemo, useState } from 'react';
import { Plus, X } from 'lucide-react';
import type { ToolDefinition } from '@/types/tool';
import { Button, Card } from '@/components/ui/primitives';
import { CopyButton, InfoTable } from '@/components/tools/common';

const UTM = ['utm_source', 'utm_medium', 'utm_campaign', 'utm_term', 'utm_content'] as const;

function parse(input: string): URL | null {
  const s = input.trim();
  if (!s) return null;
  try {
    return new URL(s);
  } catch {
    try {
      return new URL('https://' + s);
    } catch {
      return null;
    }
  }
}

export default function UrlParserTool(_: { tool: ToolDefinition }) {
  const [input, setInput] = useState('https://example.com/path/page?ref=home&lang=hi#section');
  const url = useMemo(() => parse(input), [input]);
  const params = url ? Array.from(url.searchParams.entries()) : [];

  const update = (fn: (u: URL) => void) => {
    if (!url) return;
    const next = new URL(url.href);
    fn(next);
    setInput(next.href);
  };

  const setParam = (index: number, key: string, value: string) =>
    update((u) => {
      const entries = Array.from(u.searchParams.entries());
      entries[index] = [key, value];
      u.search = new URLSearchParams(entries).toString();
    });
  const removeParam = (index: number) =>
    update((u) => {
      const entries = Array.from(u.searchParams.entries()).filter((_, i) => i !== index);
      u.search = new URLSearchParams(entries).toString();
    });

  return (
    <div className="space-y-4">
      <div>
        <label htmlFor="url-in" className="label">
          URL
        </label>
        <div className="flex gap-2">
          <input id="url-in" className="input font-mono" value={input} onChange={(e) => setInput(e.target.value)} spellCheck={false} aria-invalid={!!input.trim() && !url} />
          <CopyButton text={url?.href ?? ''} />
        </div>
        {input.trim() && !url && <p className="mt-1 text-sm text-error">This is not a valid URL.</p>}
      </div>

      {url && (
        <div className="grid gap-4 lg:grid-cols-2">
          <Card className="p-4">
            <h2 className="section-title">Parts</h2>
            <InfoTable
              rows={[
                ['Protocol', url.protocol],
                ['Host', url.hostname],
                ['Port', url.port || '(default)'],
                ['Path', decodeURIComponent(url.pathname)],
                ['Query', url.search || '—'],
                ['Fragment', url.hash || '—'],
                ['Origin', url.origin],
                ...(url.username ? ([['User', url.username]] as [string, string][]) : []),
              ]}
            />
          </Card>

          <Card className="p-4">
            <div className="mb-3 flex items-center justify-between">
              <h2 className="text-sm font-semibold">Query parameters ({params.length})</h2>
              <Button size="sm" icon={<Plus size={14} />} onClick={() => update((u) => u.searchParams.append('key', 'value'))}>
                Add
              </Button>
            </div>
            {params.length === 0 && <p className="text-sm text-muted">No parameters.</p>}
            <ul className="space-y-2">
              {params.map(([k, v], i) => (
                <li key={i} className="flex gap-2">
                  <input className="input font-mono" aria-label={`Parameter ${i + 1} name`} value={k} onChange={(e) => setParam(i, e.target.value, v)} />
                  <input className="input font-mono" aria-label={`Parameter ${i + 1} value`} value={v} onChange={(e) => setParam(i, k, e.target.value)} />
                  <button onClick={() => removeParam(i)} aria-label={`Remove parameter ${k}`} className="flex h-10 w-10 shrink-0 items-center justify-center rounded-md text-muted hover:bg-surface2 hover:text-fg">
                    <X size={15} />
                  </button>
                </li>
              ))}
            </ul>
            <p className="mt-2 text-xs text-muted">Values are shown decoded; the URL above is re-encoded automatically.</p>
          </Card>

          <Card className="p-4 lg:col-span-2">
            <h2 className="section-title">UTM campaign builder</h2>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
              {UTM.map((key) => (
                <div key={key}>
                  <label htmlFor={key} className="label">
                    {key.replace('utm_', '')}
                  </label>
                  <input
                    id={key}
                    className="input"
                    value={url.searchParams.get(key) ?? ''}
                    placeholder={key === 'utm_source' ? 'newsletter' : key === 'utm_medium' ? 'email' : key === 'utm_campaign' ? 'diwali_sale' : ''}
                    onChange={(e) =>
                      update((u) => {
                        if (e.target.value) u.searchParams.set(key, e.target.value);
                        else u.searchParams.delete(key);
                      })
                    }
                  />
                </div>
              ))}
            </div>
          </Card>
        </div>
      )}
    </div>
  );
}
