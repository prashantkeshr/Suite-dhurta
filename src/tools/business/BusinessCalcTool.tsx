import { useState } from 'react';
import type { ToolDefinition, ToolPreset } from '@/types/tool';
import { Card, Segmented } from '@/components/ui/primitives';
import { Formula } from '@/components/tools/common';

const inr = (v: number) => (Number.isFinite(v) ? v.toLocaleString('en-IN', { maximumFractionDigits: 2 }) : '—');
const pct = (v: number) => (Number.isFinite(v) ? v.toLocaleString('en-IN', { maximumFractionDigits: 2 }) + '%' : '—');
const num = (s: string) => (s.trim() === '' ? NaN : Number(s.replace(/,/g, '')));

function NumField({ label, value, onChange, suffix }: { label: string; value: string; onChange: (v: string) => void; suffix?: string }) {
  return (
    <div>
      <label className="label">{label}</label>
      <div className="relative">
        <input className="input tabular-nums" inputMode="decimal" value={value} onChange={(e) => onChange(e.target.value.replace(/[^\d.,-]/g, ''))} />
        {suffix && <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-sm text-muted">{suffix}</span>}
      </div>
    </div>
  );
}

function Result({ label, value, big }: { label: string; value: string; big?: boolean }) {
  return (
    <div className="rounded-lg border border-line bg-surface p-3">
      <p className="text-xs text-muted">{label}</p>
      <p className={`font-semibold tabular-nums text-fg ${big ? 'text-2xl' : 'text-lg'}`}>{value}</p>
    </div>
  );
}

function MarginCalc() {
  const [cost, setCost] = useState('800');
  const [price, setPrice] = useState('1000');
  const c = num(cost), p = num(price);
  const profit = p - c;
  const margin = (profit / p) * 100;
  const markup = (profit / c) * 100;
  return (
    <div className="grid gap-4 lg:grid-cols-[320px_1fr]">
      <Card className="h-fit space-y-3 p-4">
        <NumField label="Cost price" value={cost} onChange={setCost} suffix="Rs." />
        <NumField label="Selling price" value={price} onChange={setPrice} suffix="Rs." />
      </Card>
      <div className="space-y-3">
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
          <Result label={profit >= 0 ? 'Profit' : 'Loss'} value={`Rs. ${inr(Math.abs(profit))}`} big />
          <Result label="Margin (on price)" value={pct(margin)} />
          <Result label="Markup (on cost)" value={pct(markup)} />
        </div>
        <Formula>Margin = (Price − Cost) ÷ Price × 100 · Markup = (Price − Cost) ÷ Cost × 100</Formula>
      </div>
    </div>
  );
}

function BreakEvenCalc() {
  const [fixed, setFixed] = useState('100000');
  const [price, setPrice] = useState('500');
  const [varc, setVarc] = useState('300');
  const f = num(fixed), p = num(price), v = num(varc);
  const contribution = p - v;
  const units = f / contribution;
  const revenue = units * p;
  return (
    <div className="grid gap-4 lg:grid-cols-[320px_1fr]">
      <Card className="h-fit space-y-3 p-4">
        <NumField label="Fixed costs (per period)" value={fixed} onChange={setFixed} suffix="Rs." />
        <NumField label="Selling price per unit" value={price} onChange={setPrice} suffix="Rs." />
        <NumField label="Variable cost per unit" value={varc} onChange={setVarc} suffix="Rs." />
      </Card>
      <div className="space-y-3">
        {contribution > 0 ? (
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
            <Result label="Break-even units" value={inr(Math.ceil(units))} big />
            <Result label="Break-even revenue" value={`Rs. ${inr(revenue)}`} />
            <Result label="Contribution per unit" value={`Rs. ${inr(contribution)}`} />
          </div>
        ) : (
          <p className="text-sm text-warning">The selling price must be higher than the variable cost per unit to break even.</p>
        )}
        <Formula>Break-even units = Fixed costs ÷ (Price − Variable cost)</Formula>
      </div>
    </div>
  );
}

function DiscountCalc() {
  const [mrp, setMrp] = useState('2999');
  const [disc, setDisc] = useState('25');
  const m = num(mrp), d = num(disc);
  const save = m * (d / 100);
  return (
    <div className="grid gap-4 lg:grid-cols-[320px_1fr]">
      <Card className="h-fit space-y-3 p-4">
        <NumField label="MRP / list price" value={mrp} onChange={setMrp} suffix="Rs." />
        <NumField label="Discount" value={disc} onChange={setDisc} suffix="%" />
      </Card>
      <div className="space-y-3">
        <div className="grid grid-cols-2 gap-2">
          <Result label="You save" value={`Rs. ${inr(save)}`} />
          <Result label="Final price" value={`Rs. ${inr(m - save)}`} big />
        </div>
        <Formula>Final price = MRP × (1 − Discount ÷ 100)</Formula>
      </div>
    </div>
  );
}

export default function BusinessCalcTool({ preset }: { tool: ToolDefinition; preset?: ToolPreset }) {
  const initial = ['margin', 'breakeven', 'discount'].includes(String(preset?.mode)) ? (preset!.mode as 'margin') : 'margin';
  const [mode, setMode] = useState<'margin' | 'breakeven' | 'discount'>(initial);
  return (
    <div className="space-y-4">
      <Segmented label="Calculate" value={mode} onChange={setMode} options={[{ value: 'margin', label: 'Margin & markup' }, { value: 'breakeven', label: 'Break-even' }, { value: 'discount', label: 'Discount' }]} />
      {mode === 'margin' && <MarginCalc />}
      {mode === 'breakeven' && <BreakEvenCalc />}
      {mode === 'discount' && <DiscountCalc />}
    </div>
  );
}
