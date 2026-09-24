import { useState } from 'react';
import { Plus, Trash2, Shuffle } from 'lucide-react';
import type { ToolDefinition } from '@/types/tool';
import { Button, Card, Segmented, Toggle } from '@/components/ui/primitives';
import { CopyButton } from '@/components/tools/common';
import { gradientCss, shadowCss, type GradientSpec, type ShadowLayer } from './css';

const randomColor = () => `#${Array.from(crypto.getRandomValues(new Uint8Array(3)), (b) => b.toString(16).padStart(2, '0')).join('')}`;

function Range({ id, label, value, min, max, onChange, unit = '' }: { id: string; label: string; value: number; min: number; max: number; onChange: (v: number) => void; unit?: string }) {
  return (
    <div>
      <label htmlFor={id} className="label">
        {label}: {value}
        {unit}
      </label>
      <input id={id} type="range" min={min} max={max} value={value} onChange={(e) => onChange(Number(e.target.value))} className="w-full accent-[rgb(var(--accent))]" />
    </div>
  );
}

function GradientEditor() {
  const [g, setG] = useState<GradientSpec>({
    type: 'linear',
    angle: 135,
    shape: 'circle',
    stops: [
      { color: '#2563eb', at: 0 },
      { color: '#9333ea', at: 55 },
      { color: '#f59e0b', at: 100 },
    ],
  });
  const css = gradientCss(g);
  const setStop = (i: number, patch: Partial<GradientSpec['stops'][number]>) => setG({ ...g, stops: g.stops.map((s, k) => (k === i ? { ...s, ...patch } : s)) });
  return (
    <div className="grid gap-4 lg:grid-cols-[1fr_340px]">
      <div className="space-y-3">
        <div className="h-64 rounded-lg border border-line" style={{ background: css }} role="img" aria-label="Gradient preview" />
        <Card className="flex items-center gap-2 p-3">
          <code className="min-w-0 flex-1 break-all font-mono text-[13px]">background: {css};</code>
          <CopyButton text={`background: ${css};`} />
        </Card>
      </div>
      <Card className="h-fit space-y-4 p-4">
        <Segmented label="Type" value={g.type} onChange={(type) => setG({ ...g, type })} options={[{ value: 'linear', label: 'Linear' }, { value: 'radial', label: 'Radial' }, { value: 'conic', label: 'Conic' }]} />
        {g.type === 'radial' ? (
          <Segmented label="Shape" value={g.shape} onChange={(shape) => setG({ ...g, shape })} options={[{ value: 'circle', label: 'Circle' }, { value: 'ellipse', label: 'Ellipse' }]} />
        ) : (
          <Range id="g-angle" label="Angle" value={g.angle} min={0} max={360} unit="°" onChange={(angle) => setG({ ...g, angle })} />
        )}
        <div className="space-y-2">
          <span className="label">Colour stops</span>
          {g.stops.map((s, i) => (
            <div key={i} className="flex items-center gap-2">
              <input type="color" aria-label={`Stop ${i + 1} colour`} value={s.color} onChange={(e) => setStop(i, { color: e.target.value })} className="h-9 w-10 shrink-0 cursor-pointer rounded border border-line" />
              <input type="range" aria-label={`Stop ${i + 1} position`} min={0} max={100} value={s.at} onChange={(e) => setStop(i, { at: Number(e.target.value) })} className="flex-1 accent-[rgb(var(--accent))]" />
              <span className="w-10 text-right text-xs tabular-nums text-muted">{s.at}%</span>
              <button aria-label={`Remove stop ${i + 1}`} disabled={g.stops.length <= 2} onClick={() => setG({ ...g, stops: g.stops.filter((_, k) => k !== i) })} className="flex h-8 w-8 items-center justify-center rounded text-muted hover:text-error disabled:opacity-30">
                <Trash2 size={14} />
              </button>
            </div>
          ))}
          <div className="flex gap-2">
            <Button size="sm" icon={<Plus size={14} />} disabled={g.stops.length >= 8} onClick={() => setG({ ...g, stops: [...g.stops, { color: randomColor(), at: 50 }] })}>
              Add stop
            </Button>
            <Button size="sm" icon={<Shuffle size={14} />} onClick={() => setG({ ...g, stops: g.stops.map((s) => ({ ...s, color: randomColor() })) })}>
              Random colours
            </Button>
          </div>
        </div>
      </Card>
    </div>
  );
}

function ShadowEditor() {
  const [layers, setLayers] = useState<ShadowLayer[]>([
    { x: 0, y: 10, blur: 30, spread: -5, color: '#0f172a', opacity: 25, inset: false },
    { x: 0, y: 2, blur: 6, spread: 0, color: '#0f172a', opacity: 12, inset: false },
  ]);
  const [active, setActive] = useState(0);
  const [bg, setBg] = useState('#f1f5f9');
  const [radius, setRadius] = useState(12);
  const css = shadowCss(layers);
  const l = layers[active];
  const set = (patch: Partial<ShadowLayer>) => setLayers(layers.map((x, i) => (i === active ? { ...x, ...patch } : x)));
  return (
    <div className="grid gap-4 lg:grid-cols-[1fr_340px]">
      <div className="space-y-3">
        <div className="flex h-64 items-center justify-center rounded-lg border border-line" style={{ background: bg }}>
          <div className="h-32 w-48 bg-white" style={{ boxShadow: css, borderRadius: radius }} role="img" aria-label="Shadow preview" />
        </div>
        <Card className="flex items-center gap-2 p-3">
          <code className="min-w-0 flex-1 break-all font-mono text-[13px]">box-shadow: {css};</code>
          <CopyButton text={`box-shadow: ${css};`} />
        </Card>
      </div>
      <Card className="h-fit space-y-3 p-4">
        <div className="flex flex-wrap items-center gap-1">
          {layers.map((_, i) => (
            <Button key={i} size="sm" variant={i === active ? 'primary' : 'secondary'} onClick={() => setActive(i)} aria-pressed={i === active}>
              Layer {i + 1}
            </Button>
          ))}
          <Button size="sm" icon={<Plus size={14} />} disabled={layers.length >= 5} onClick={() => (setLayers([...layers, { x: 0, y: 4, blur: 10, spread: 0, color: '#000000', opacity: 20, inset: false }]), setActive(layers.length))} aria-label="Add layer" />
          <Button size="sm" icon={<Trash2 size={14} />} disabled={layers.length <= 1} onClick={() => (setLayers(layers.filter((_, i) => i !== active)), setActive(0))} aria-label="Remove layer" />
        </div>
        {l && (
          <>
            <div className="grid grid-cols-2 gap-3">
              <Range id="s-x" label="X" value={l.x} min={-50} max={50} unit="px" onChange={(x) => set({ x })} />
              <Range id="s-y" label="Y" value={l.y} min={-50} max={50} unit="px" onChange={(y) => set({ y })} />
              <Range id="s-blur" label="Blur" value={l.blur} min={0} max={100} unit="px" onChange={(blur) => set({ blur })} />
              <Range id="s-spread" label="Spread" value={l.spread} min={-50} max={50} unit="px" onChange={(spread) => set({ spread })} />
            </div>
            <div className="flex items-center gap-3">
              <input type="color" aria-label="Shadow colour" value={l.color} onChange={(e) => set({ color: e.target.value })} className="h-9 w-10 cursor-pointer rounded border border-line" />
              <div className="flex-1">
                <Range id="s-op" label="Opacity" value={l.opacity} min={0} max={100} unit="%" onChange={(opacity) => set({ opacity })} />
              </div>
            </div>
            <Toggle checked={l.inset} onChange={(inset) => set({ inset })} label="Inset" />
          </>
        )}
        <div className="grid grid-cols-2 gap-3 border-t border-line pt-3">
          <Range id="s-radius" label="Preview radius" value={radius} min={0} max={64} unit="px" onChange={setRadius} />
          <div>
            <span className="label">Background</span>
            <input type="color" aria-label="Preview background" value={bg} onChange={(e) => setBg(e.target.value)} className="h-9 w-full cursor-pointer rounded border border-line" />
          </div>
        </div>
      </Card>
    </div>
  );
}

export default function CssGeneratorTool({ tool }: { tool: ToolDefinition }) {
  return tool.id === 'css-shadow' ? <ShadowEditor /> : <GradientEditor />;
}
