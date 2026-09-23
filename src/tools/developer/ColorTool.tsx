import { useMemo, useState } from 'react';
import { CheckCircle2, XCircle } from 'lucide-react';
import type { ToolDefinition } from '@/types/tool';
import { Card } from '@/components/ui/primitives';
import { CopyButton } from '@/components/tools/common';
import { parseColor, rgbToHsl, toHex, contrastRatio, type RGB } from './logic';

function ColorInput({ id, label, value, onChange }: { id: string; label: string; value: string; onChange: (v: string) => void }) {
  const parsed = parseColor(value);
  return (
    <div>
      <label htmlFor={id} className="label">
        {label}
      </label>
      <div className="flex gap-2">
        <input type="color" aria-label={`${label} picker`} value={parsed ? toHex({ ...parsed, a: 1 }) : '#000000'} onChange={(e) => onChange(e.target.value)} className="h-10 w-12 shrink-0 cursor-pointer rounded border border-line bg-surface" />
        <input id={id} className="input font-mono" value={value} onChange={(e) => onChange(e.target.value)} aria-invalid={!parsed} spellCheck={false} />
      </div>
      {!parsed && <p className="mt-1 text-xs text-error">Use #hex, rgb() or hsl().</p>}
    </div>
  );
}

const Pass = ({ ok, label }: { ok: boolean; label: string }) => (
  <li className="flex items-center gap-1.5">
    {ok ? <CheckCircle2 size={15} className="text-success" aria-hidden /> : <XCircle size={15} className="text-error" aria-hidden />}
    <span>
      {label}: <strong>{ok ? 'Pass' : 'Fail'}</strong>
    </span>
  </li>
);

export default function ColorTool(_: { tool: ToolDefinition }) {
  const [fg, setFg] = useState('#1e40af');
  const [bg, setBg] = useState('#ffffff');
  const c = parseColor(fg);
  const b = parseColor(bg);

  const formats = useMemo(() => {
    if (!c) return [];
    const hsl = rgbToHsl(c);
    const alpha = c.a < 1 ? ` / ${+c.a.toFixed(2)}` : '';
    return [
      ['HEX', toHex(c)],
      ['RGB', c.a < 1 ? `rgba(${c.r}, ${c.g}, ${c.b}, ${+c.a.toFixed(2)})` : `rgb(${c.r}, ${c.g}, ${c.b})`],
      ['HSL', c.a < 1 ? `hsla(${hsl.h}, ${hsl.s}%, ${hsl.l}%, ${+c.a.toFixed(2)})` : `hsl(${hsl.h}, ${hsl.s}%, ${hsl.l}%)`],
      ['CSS (modern)', `rgb(${c.r} ${c.g} ${c.b}${alpha})`],
    ];
  }, [c]);

  const ratio = c && b ? contrastRatio(c as RGB, b as RGB) : null;

  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <Card className="space-y-4 p-4">
        <ColorInput id="fg" label="Colour" value={fg} onChange={setFg} />
        {c && (
          <>
            <div className="checker h-16 rounded-md border border-line">
              <div className="h-full w-full rounded-md" style={{ background: `rgba(${c.r},${c.g},${c.b},${c.a})` }} />
            </div>
            <ul className="space-y-2">
              {formats.map(([k, v]) => (
                <li key={k} className="flex items-center gap-2">
                  <span className="w-28 shrink-0 text-xs text-muted">{k}</span>
                  <code className="min-w-0 flex-1 truncate font-mono text-sm">{v}</code>
                  <CopyButton text={v} />
                </li>
              ))}
            </ul>
          </>
        )}
      </Card>
      <Card className="space-y-4 p-4">
        <ColorInput id="bg" label="Background (for contrast)" value={bg} onChange={setBg} />
        {c && b && ratio && (
          <>
            <div className="rounded-md border border-line p-4" style={{ background: toHex({ ...b, a: 1 }), color: toHex({ ...c, a: 1 }) }}>
              <p className="text-lg font-semibold">Large heading text</p>
              <p className="text-sm">Normal body text — सामान्य पाठ</p>
            </div>
            <p className="text-sm">
              Contrast ratio: <strong className="text-lg tabular-nums">{ratio.toFixed(2)}:1</strong>
            </p>
            <ul className="grid grid-cols-2 gap-1 text-sm">
              <Pass ok={ratio >= 4.5} label="AA normal" />
              <Pass ok={ratio >= 3} label="AA large" />
              <Pass ok={ratio >= 7} label="AAA normal" />
              <Pass ok={ratio >= 4.5} label="AAA large" />
            </ul>
            <p className="text-xs text-muted">WCAG 2.x formula. Transparency is ignored for the contrast check.</p>
          </>
        )}
      </Card>
    </div>
  );
}
