import { useCallback, useEffect, useMemo, useState } from 'react';
import { RefreshCw } from 'lucide-react';
import { clsx } from 'clsx';
import type { ToolDefinition } from '@/types/tool';
import { Button, Card, Toggle } from '@/components/ui/primitives';
import { CopyButton } from '@/components/tools/common';
import { generatePassword, passwordAlphabet, entropyBits, strengthLabel, type PasswordOptions } from './logic';

export default function PasswordTool(_: { tool: ToolDefinition }) {
  const [o, setO] = useState<PasswordOptions>({ length: 20, lower: true, upper: true, digits: true, symbols: true, excludeAmbiguous: false });
  const [count, setCount] = useState(1);
  const [list, setList] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);

  const regenerate = useCallback(() => {
    try {
      setList(Array.from({ length: count }, () => generatePassword(o)));
      setError(null);
    } catch (err) {
      setList([]);
      setError((err as Error).message);
    }
  }, [o, count]);

  useEffect(regenerate, [regenerate]);

  const size = useMemo(() => passwordAlphabet(o).join('').length, [o]);
  const bits = entropyBits(o.length, size);
  const strength = strengthLabel(bits);
  const set = <K extends keyof PasswordOptions>(k: K) => (v: PasswordOptions[K]) => setO((p) => ({ ...p, [k]: v }));

  return (
    <div className="grid gap-4 lg:grid-cols-[1fr_300px]">
      <Card className="space-y-4 p-4">
        {error ? (
          <p className="text-sm text-error">{error}</p>
        ) : (
          <ul className="space-y-2">
            {list.map((p, i) => (
              <li key={i} className="flex items-center gap-2">
                <code className="min-w-0 flex-1 break-all rounded-md border border-line bg-surface2 px-3 py-2.5 font-mono text-[15px]">{p}</code>
                <CopyButton text={p} />
              </li>
            ))}
          </ul>
        )}
        <div className="flex flex-wrap items-center gap-3">
          <Button variant="primary" icon={<RefreshCw size={15} />} onClick={regenerate}>
            Generate
          </Button>
          {list.length > 1 && <CopyButton text={list.join('\n')} label="Copy all" />}
          <span className={clsx('text-sm font-medium', strength.tone === 'error' ? 'text-error' : strength.tone === 'warning' ? 'text-warning' : 'text-success')}>
            {strength.label} · {Math.round(bits)} bits of entropy
          </span>
        </div>
        <p className="text-xs text-muted">Generated in your browser with crypto.getRandomValues. Passwords are never stored or sent anywhere.</p>
      </Card>
      <Card className="h-fit space-y-3 p-4">
        <div>
          <label htmlFor="pw-len" className="label">
            Length: {o.length}
          </label>
          <input id="pw-len" type="range" min={6} max={128} value={o.length} onChange={(e) => set('length')(Number(e.target.value))} className="w-full accent-[rgb(var(--accent))]" />
        </div>
        <div className="divide-y divide-line">
          <Toggle checked={o.upper} onChange={set('upper')} label="Uppercase (A–Z)" />
          <Toggle checked={o.lower} onChange={set('lower')} label="Lowercase (a–z)" />
          <Toggle checked={o.digits} onChange={set('digits')} label="Numbers (0–9)" />
          <Toggle checked={o.symbols} onChange={set('symbols')} label="Symbols (!@#…)" />
          <Toggle checked={o.excludeAmbiguous} onChange={set('excludeAmbiguous')} label="Avoid look-alikes" description="Excludes I, l, 1, O, 0 and similar." />
        </div>
        <div>
          <label htmlFor="pw-count" className="label">
            How many
          </label>
          <input id="pw-count" type="number" min={1} max={50} className="input" value={count} onChange={(e) => setCount(Math.min(50, Math.max(1, Number(e.target.value) || 1)))} />
        </div>
      </Card>
    </div>
  );
}
