import { Fragment, useEffect, useRef, useState } from 'react';
import { clsx } from 'clsx';
import type { ToolDefinition } from '@/types/tool';
import { Card } from '@/components/ui/primitives';
import { TextPanel } from '@/components/tools/common';

interface Match {
  index: number;
  end: number;
  text: string;
  groups: (string | undefined)[];
  named?: Record<string, string>;
}
type Result = { ok: true; matches: Match[]; truncated: boolean } | { ok: false; error: string } | { ok: false; timeout: true };

const FLAGS = [
  { f: 'g', label: 'global' },
  { f: 'i', label: 'ignore case' },
  { f: 'm', label: 'multiline' },
  { f: 's', label: 'dot matches newline' },
  { f: 'u', label: 'unicode' },
];

const TIMEOUT_MS = 1500;

export default function RegexTesterTool(_: { tool: ToolDefinition }) {
  const [pattern, setPattern] = useState('(\\w+)@(\\w+)\\.com');
  const [flags, setFlags] = useState('gu');
  const [text, setText] = useState('Contact: asha@example.com, ravi@test.com');
  const [result, setResult] = useState<Result | null>(null);
  const workerRef = useRef<Worker | null>(null);

  useEffect(() => {
    if (!pattern) {
      setResult(null);
      return;
    }
    const handle = setTimeout(() => {
      workerRef.current?.terminate();
      const worker = new Worker(new URL('../../workers/regex.worker.ts', import.meta.url), { type: 'module' });
      workerRef.current = worker;
      const timer = setTimeout(() => {
        worker.terminate();
        setResult({ ok: false, timeout: true });
      }, TIMEOUT_MS);
      worker.onmessage = (e) => {
        clearTimeout(timer);
        worker.terminate();
        setResult(e.data);
      };
      worker.postMessage({ pattern, flags, text });
    }, 200);
    return () => clearTimeout(handle);
  }, [pattern, flags, text]);

  useEffect(() => () => workerRef.current?.terminate(), []);

  const matches = result?.ok ? result.matches : [];

  // Build highlighted output as React nodes (never innerHTML).
  const highlighted: JSX.Element[] = [];
  let last = 0;
  matches.forEach((m, i) => {
    if (m.index < last) return;
    highlighted.push(<Fragment key={`t${i}`}>{text.slice(last, m.index)}</Fragment>);
    highlighted.push(
      <mark key={`m${i}`} className={clsx('rounded-sm px-px text-fg', i % 2 ? 'bg-accent/30' : 'bg-warning/30')}>
        {m.text || '∅'}
      </mark>,
    );
    last = m.end;
  });
  highlighted.push(<Fragment key="end">{text.slice(last)}</Fragment>);

  return (
    <div className="space-y-4">
      <div>
        <label htmlFor="re-pattern" className="label">
          Pattern
        </label>
        <div className="flex items-center gap-1 rounded-md border border-line bg-surface px-3 focus-within:border-accent focus-within:ring-2 focus-within:ring-accent/40">
          <span className="font-mono text-muted">/</span>
          <input id="re-pattern" className="h-10 w-full bg-transparent font-mono text-sm focus:outline-none" value={pattern} onChange={(e) => setPattern(e.target.value)} spellCheck={false} />
          <span className="font-mono text-muted">/{flags}</span>
        </div>
        <div className="mt-2 flex flex-wrap gap-1.5" role="group" aria-label="Flags">
          {FLAGS.map(({ f, label }) => (
            <button
              key={f}
              aria-pressed={flags.includes(f)}
              onClick={() => setFlags(flags.includes(f) ? flags.replace(f, '') : flags + f)}
              className={clsx('min-h-[32px] rounded-md border px-2.5 text-xs', flags.includes(f) ? 'border-accent bg-accent/10 text-accent' : 'border-line text-muted hover:text-fg')}
            >
              <span className="font-mono font-semibold">{f}</span> {label}
            </button>
          ))}
        </div>
      </div>

      <div aria-live="polite" className="text-sm">
        {result && !result.ok && 'timeout' in result && <p className="text-error">The pattern took longer than {TIMEOUT_MS / 1000}s and was stopped. It may cause catastrophic backtracking.</p>}
        {result && !result.ok && 'error' in result && <p className="text-error">Invalid pattern: {result.error}</p>}
        {result?.ok && (
          <p className="text-muted">
            {matches.length} match{matches.length === 1 ? '' : 'es'}
            {result.truncated && ' (showing the first 1000)'}
          </p>
        )}
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <TextPanel id="re-text" label="Test text" value={text} onChange={setText} rows={10} />
        <div>
          <p className="label mb-1.5 flex min-h-[32px] items-center">Matches highlighted</p>
          <pre className="min-h-[160px] whitespace-pre-wrap break-words rounded-md border border-line bg-surface p-3 font-mono text-[13px] leading-relaxed">{highlighted}</pre>
        </div>
      </div>

      {matches.length > 0 && matches.some((m) => m.groups.length > 0) && (
        <Card className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="border-b border-line text-xs uppercase text-muted">
              <tr>
                <th className="px-3 py-2">#</th>
                <th className="px-3 py-2">Match</th>
                {matches[0].groups.map((_, i) => (
                  <th key={i} className="px-3 py-2">
                    Group {i + 1}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-line font-mono text-[13px]">
              {matches.slice(0, 100).map((m, i) => (
                <tr key={i}>
                  <td className="px-3 py-1.5 text-muted">{i + 1}</td>
                  <td className="px-3 py-1.5">{m.text}</td>
                  {m.groups.map((g, j) => (
                    <td key={j} className="px-3 py-1.5">
                      {g ?? <span className="text-muted">—</span>}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      )}
    </div>
  );
}
