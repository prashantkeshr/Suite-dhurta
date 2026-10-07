import { useCallback, useEffect, useState } from 'react';
import { RefreshCw } from 'lucide-react';
import { long } from '@wordlist/english-eff/long';
import type { ToolDefinition } from '@/types/tool';
import { Button, Card, Select, Toggle } from '@/components/ui/primitives';
import { CopyButton } from '@/components/tools/common';
import { passphrase, entropyBits, crackTime, type PassphraseOptions } from './passphrase';

const SEPARATORS = [
  { value: '-', label: 'Hyphen  ( - )' },
  { value: ' ', label: 'Space' },
  { value: '.', label: 'Dot  ( . )' },
  { value: '_', label: 'Underscore  ( _ )' },
  { value: '', label: 'None' },
];

export default function PassphraseTool(_: { tool: ToolDefinition }) {
  const [o, setO] = useState<PassphraseOptions>({ words: 6, separator: '-', capitalize: false, digit: false });
  const [list, setList] = useState<string[]>([]);
  const make = useCallback(() => setList(Array.from({ length: 5 }, () => passphrase(long, o))), [o]);
  useEffect(make, [make]);

  const bits = entropyBits(long.length, o);
  const strength = bits >= 77 ? { label: 'Very strong', tone: 'text-success' } : bits >= 64 ? { label: 'Strong', tone: 'text-success' } : bits >= 50 ? { label: 'Fair — fine for low-value accounts', tone: 'text-warning' } : { label: 'Weak', tone: 'text-error' };

  return (
    <div className="grid gap-4 lg:grid-cols-[320px_1fr]">
      <Card className="h-fit space-y-3 p-4">
        <div>
          <label htmlFor="pp-words" className="label">
            Words: {o.words}
          </label>
          <input id="pp-words" type="range" min={3} max={10} value={o.words} onChange={(e) => setO({ ...o, words: Number(e.target.value) })} className="w-full accent-[rgb(var(--accent))]" />
        </div>
        <Select label="Separator" value={o.separator} onChange={(e) => setO({ ...o, separator: e.target.value })} options={SEPARATORS} />
        <Toggle checked={o.capitalize} onChange={(v) => setO({ ...o, capitalize: v })} label="Capitalise each word" />
        <Toggle checked={o.digit} onChange={(v) => setO({ ...o, digit: v })} label="Add a number" description="For sites that insist on a digit." />
        <div className="rounded-md border border-line p-3 text-sm">
          <p className={`font-semibold ${strength.tone}`}>{strength.label}</p>
          <p className="text-muted">
            {bits.toFixed(0)} bits of randomness. Even an attacker who knows this exact method and makes a trillion guesses a second would need about <strong className="text-fg">{crackTime(bits)}</strong>.
          </p>
        </div>
      </Card>
      <div className="space-y-2">
        {list.map((p, i) => (
          <Card key={i} className="flex items-center justify-between gap-3 p-3">
            <code className="min-w-0 break-all font-mono text-[15px] text-fg">{p}</code>
            <CopyButton text={p} />
          </Card>
        ))}
        <Button icon={<RefreshCw size={16} />} onClick={make}>
          New passphrases
        </Button>
        <p className="text-xs text-muted">Words are picked with your browser’s cryptographic random generator from the EFF long word list (7,776 words). Nothing is stored or sent. Use a different passphrase for every site — a password manager helps.</p>
      </div>
    </div>
  );
}
