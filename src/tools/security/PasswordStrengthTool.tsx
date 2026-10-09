import { useState } from 'react';
import { Eye, EyeOff, AlertTriangle, CheckCircle2, Lightbulb } from 'lucide-react';
import type { ToolDefinition } from '@/types/tool';
import { Card } from '@/components/ui/primitives';
import { estimateStrength } from './passwordStrength';

const BAR = ['bg-error', 'bg-error', 'bg-warning', 'bg-success', 'bg-success'];
const TEXT = ['text-error', 'text-error', 'text-warning', 'text-success', 'text-success'];

export default function PasswordStrengthTool(_: { tool: ToolDefinition }) {
  const [pw, setPw] = useState('');
  const [show, setShow] = useState(false);
  const r = estimateStrength(pw);

  return (
    <div className="mx-auto max-w-2xl space-y-4">
      <Card className="space-y-4 p-4">
        <div>
          <label htmlFor="ps-pw" className="label">
            Type or paste a password to test
          </label>
          <div className="relative">
            <input id="ps-pw" className="input pr-10 font-mono" type={show ? 'text' : 'password'} autoComplete="off" autoFocus value={pw} onChange={(e) => setPw(e.target.value)} placeholder="Your password" />
            <button type="button" onClick={() => setShow(!show)} className="absolute right-2 top-1/2 -translate-y-1/2 rounded p-1.5 text-muted hover:text-fg" aria-label={show ? 'Hide' : 'Show'}>
              {show ? <EyeOff size={16} /> : <Eye size={16} />}
            </button>
          </div>
        </div>

        {pw && (
          <>
            <div>
              <div className="flex gap-1" aria-hidden>
                {[0, 1, 2, 3, 4].map((i) => (
                  <span key={i} className={`h-2 flex-1 rounded-full ${i <= r.score ? BAR[r.score] : 'bg-surface2'}`} />
                ))}
              </div>
              <div className="mt-2 flex flex-wrap items-baseline justify-between gap-2">
                <p className={`text-lg font-semibold ${TEXT[r.score]}`}>{r.label}</p>
                <p className="text-sm text-muted">{r.bits} bits · {pw.length} characters</p>
              </div>
            </div>

            <div className="rounded-md border border-line p-3 text-sm">
              <p className="text-muted">
                Time to crack by an offline attacker making 10 billion guesses a second: <strong className="text-fg">{r.crackTime}</strong>.
              </p>
            </div>

            {r.warnings.map((w) => (
              <p key={w} className="flex gap-2 text-sm text-warning">
                <AlertTriangle size={16} className="mt-0.5 shrink-0" /> {w}
              </p>
            ))}
            {r.suggestions.map((sug) => (
              <p key={sug} className="flex gap-2 text-sm text-muted">
                <Lightbulb size={16} className="mt-0.5 shrink-0 text-accent" /> {sug}
              </p>
            ))}
            {r.score >= 3 && r.warnings.length === 0 && (
              <p className="flex gap-2 text-sm text-success">
                <CheckCircle2 size={16} className="mt-0.5 shrink-0" /> This is a solid password. Use it on only one account, and store it in a password manager.
              </p>
            )}
          </>
        )}
      </Card>
      <p className="text-xs text-muted">
        Your password is checked entirely in your browser and is never sent anywhere — you can turn off your internet and it still works. This is an estimate based on length, character variety and common patterns; a real attacker’s wordlists may do better, so treat it as a guide, not a guarantee. The safest choice is a long passphrase stored in a password manager.
      </p>
    </div>
  );
}
