import { useMemo, useState, type ReactNode } from 'react';
import { ArrowLeftRight } from 'lucide-react';
import { clsx } from 'clsx';
import type { ToolDefinition } from '@/types/tool';
import { Button, Card, Segmented, Select } from '@/components/ui/primitives';
import { Formula, CopyButton, DownloadTextButton } from '@/components/tools/common';
import { emi, gst, percentOf, whatPercent, percentChange, UNIT_CATEGORIES, convertUnit, formatValue } from './logic';

const num = (s: string) => (s.trim() === '' ? NaN : Number(s.replace(/,/g, '')));
const inr = (v: number) => (Number.isFinite(v) ? v.toLocaleString('en-IN', { maximumFractionDigits: 2, minimumFractionDigits: 2 }) : '—');
const plain = (v: number, d = 4) => (Number.isFinite(v) ? v.toLocaleString(undefined, { maximumFractionDigits: d }) : '—');

function NumField({ id, label, value, onChange, suffix }: { id: string; label: string; value: string; onChange: (v: string) => void; suffix?: string }) {
  return (
    <div>
      <label htmlFor={id} className="label">
        {label}
      </label>
      <div className="relative">
        <input id={id} className={clsx('input tabular-nums', suffix && 'pr-12')} inputMode="decimal" value={value} onChange={(e) => onChange(e.target.value.replace(/[^\d.,-]/g, ''))} />
        {suffix && <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-sm text-muted">{suffix}</span>}
      </div>
    </div>
  );
}

function Result({ label, value, big }: { label: string; value: ReactNode; big?: boolean }) {
  return (
    <div className="rounded-lg border border-line bg-surface p-3">
      <p className="text-xs text-muted">{label}</p>
      <p className={clsx('font-semibold tabular-nums text-fg', big ? 'text-2xl' : 'text-lg')}>{value}</p>
    </div>
  );
}

/* ---------- Percentage ---------- */

export function PercentageTool(_: { tool: ToolDefinition }) {
  const [a, setA] = useState('18');
  const [b, setB] = useState('2500');
  const [c, setC] = useState('450');
  const [d, setD] = useState('1800');
  const [from, setFrom] = useState('1200');
  const [to, setTo] = useState('1500');
  const [price, setPrice] = useState('2999');
  const [off, setOff] = useState('25');
  const [cost, setCost] = useState('800');
  const [sell, setSell] = useState('1000');

  const discount = num(price) * (num(off) / 100);
  const profit = num(sell) - num(cost);

  return (
    <div className="grid gap-4 md:grid-cols-2">
      <Card className="space-y-3 p-4">
        <h2 className="text-sm font-semibold">What is X% of Y?</h2>
        <div className="grid grid-cols-2 gap-2">
          <NumField id="p-a" label="Percent" value={a} onChange={setA} suffix="%" />
          <NumField id="p-b" label="Of" value={b} onChange={setB} />
        </div>
        <Result label="Result" value={plain(percentOf(num(a), num(b)))} big />
        <Formula>X ÷ 100 × Y</Formula>
      </Card>
      <Card className="space-y-3 p-4">
        <h2 className="text-sm font-semibold">X is what percent of Y?</h2>
        <div className="grid grid-cols-2 gap-2">
          <NumField id="p-c" label="Part" value={c} onChange={setC} />
          <NumField id="p-d" label="Whole" value={d} onChange={setD} />
        </div>
        <Result label="Result" value={`${plain(whatPercent(num(c), num(d)), 4)}%`} big />
        <Formula>X ÷ Y × 100</Formula>
      </Card>
      <Card className="space-y-3 p-4">
        <h2 className="text-sm font-semibold">Percentage change</h2>
        <div className="grid grid-cols-2 gap-2">
          <NumField id="p-from" label="From" value={from} onChange={setFrom} />
          <NumField id="p-to" label="To" value={to} onChange={setTo} />
        </div>
        <Result label={percentChange(num(from), num(to)) >= 0 ? 'Increase' : 'Decrease'} value={`${plain(percentChange(num(from), num(to)), 4)}%`} big />
        <Formula>(New − Old) ÷ |Old| × 100</Formula>
      </Card>
      <Card className="space-y-3 p-4">
        <h2 className="text-sm font-semibold">Discount</h2>
        <div className="grid grid-cols-2 gap-2">
          <NumField id="p-price" label="Price" value={price} onChange={setPrice} />
          <NumField id="p-off" label="Discount" value={off} onChange={setOff} suffix="%" />
        </div>
        <div className="grid grid-cols-2 gap-2">
          <Result label="You save" value={inr(discount)} />
          <Result label="Final price" value={inr(num(price) - discount)} />
        </div>
        <Formula>Final = Price × (1 − Discount ÷ 100)</Formula>
      </Card>
      <Card className="space-y-3 p-4 md:col-span-2">
        <h2 className="text-sm font-semibold">Profit / loss</h2>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          <NumField id="p-cost" label="Cost price" value={cost} onChange={setCost} />
          <NumField id="p-sell" label="Selling price" value={sell} onChange={setSell} />
          <Result label={profit >= 0 ? 'Profit' : 'Loss'} value={inr(Math.abs(profit))} />
          <Result label="Margin on cost (markup)" value={`${plain((profit / num(cost)) * 100, 2)}%`} />
        </div>
        <p className="text-sm text-muted">Margin on selling price: {plain((profit / num(sell)) * 100, 2)}%</p>
        <Formula>Profit % = (SP − CP) ÷ CP × 100 · Margin = (SP − CP) ÷ SP × 100</Formula>
      </Card>
    </div>
  );
}

/* ---------- GST ---------- */

// Slabs after the GST rationalisation of 22 Sep 2025. 12% and 28% applied before that date.
const RATES = ['0', '0.25', '3', '5', '18', '40'];

export function GstTool(_: { tool: ToolDefinition }) {
  const [amount, setAmount] = useState('10000');
  const [rate, setRate] = useState('18');
  const [mode, setMode] = useState<'add' | 'remove'>('add');
  const [supply, setSupply] = useState<'intra' | 'inter'>('intra');
  const r = gst(num(amount), num(rate), mode);
  return (
    <div className="grid gap-4 lg:grid-cols-[320px_1fr]">
      <Card className="h-fit space-y-4 p-4">
        <Segmented label="Amount is" value={mode} onChange={setMode} options={[{ value: 'add', label: 'Before GST (add)' }, { value: 'remove', label: 'Including GST (remove)' }]} />
        <NumField id="gst-amt" label="Amount (₹)" value={amount} onChange={setAmount} />
        <div>
          <span className="label">GST rate</span>
          <div className="flex flex-wrap gap-1">
            {RATES.map((x) => (
              <Button key={x} size="sm" variant={rate === x ? 'primary' : 'secondary'} aria-pressed={rate === x} onClick={() => setRate(x)}>
                {x}%
              </Button>
            ))}
          </div>
          <div className="mt-2">
            <NumField id="gst-rate" label="Custom rate" value={rate} onChange={setRate} suffix="%" />
          </div>
        </div>
        <Segmented label="Supply" value={supply} onChange={setSupply} options={[{ value: 'intra', label: 'Within state' }, { value: 'inter', label: 'Inter-state' }]} />
      </Card>
      <div className="space-y-3">
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
          <Result label="Net amount" value={`₹ ${inr(r.net)}`} />
          <Result label={`GST @ ${plain(num(rate), 2)}%`} value={`₹ ${inr(r.gst)}`} />
          <Result label="Total (gross)" value={`₹ ${inr(r.gross)}`} big />
          {supply === 'intra' ? (
            <>
              <Result label={`CGST @ ${plain(num(rate) / 2, 2)}%`} value={`₹ ${inr(r.cgst)}`} />
              <Result label={`SGST @ ${plain(num(rate) / 2, 2)}%`} value={`₹ ${inr(r.sgst)}`} />
            </>
          ) : (
            <Result label={`IGST @ ${plain(num(rate), 2)}%`} value={`₹ ${inr(r.gst)}`} />
          )}
        </div>
        <Formula>{mode === 'add' ? 'GST = Net × Rate ÷ 100 · Total = Net + GST' : 'Net = Gross ÷ (1 + Rate ÷ 100) · GST = Gross − Net'}</Formula>
        <p className="text-xs text-muted">{supply === 'intra' ? 'Within a state, GST is split equally into CGST and SGST/UTGST.' : 'For inter-state supply, the full amount is IGST.'} The 12% and 28% slabs applied before 22 September 2025 — enter them as a custom rate for older invoices. Always confirm the applicable rate for your goods or service.</p>
      </div>
    </div>
  );
}

/* ---------- EMI ---------- */

export function EmiTool(_: { tool: ToolDefinition }) {
  const [p, setP] = useState('2500000');
  const [rate, setRate] = useState('8.5');
  const [years, setYears] = useState('20');
  const [unit, setUnit] = useState<'years' | 'months'>('years');
  const [showAll, setShowAll] = useState(false);
  const months = unit === 'years' ? num(years) * 12 : num(years);
  const result = useMemo(() => {
    try {
      return emi(num(p), num(rate), months);
    } catch (err) {
      return { error: (err as Error).message };
    }
  }, [p, rate, months]);
  const ok = !('error' in result);
  const interestShare = ok ? (result.totalInterest / result.totalPayment) * 100 : 0;
  const csv = ok ? ['Month,Payment,Principal,Interest,Balance', ...result.schedule.map((s) => [s.month, s.payment, s.principal, s.interest, s.balance].map((v) => v.toFixed(2)).join(','))].join('\n') : '';

  return (
    <div className="grid gap-4 lg:grid-cols-[320px_1fr]">
      <Card className="h-fit space-y-4 p-4">
        <NumField id="emi-p" label="Loan amount (₹)" value={p} onChange={setP} />
        <NumField id="emi-r" label="Interest rate (per year)" value={rate} onChange={setRate} suffix="%" />
        <div className="grid grid-cols-[1fr_auto] items-end gap-2">
          <NumField id="emi-n" label="Tenure" value={years} onChange={setYears} />
          <Segmented label="Unit" value={unit} onChange={setUnit} options={[{ value: 'years', label: 'Years' }, { value: 'months', label: 'Months' }]} />
        </div>
      </Card>
      <div className="min-w-0 space-y-3">
        {!ok ? (
          <p className="text-sm text-error">{result.error}</p>
        ) : (
          <>
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
              <Result label="Monthly EMI" value={`₹ ${inr(result.emi)}`} big />
              <Result label="Total interest" value={`₹ ${inr(result.totalInterest)}`} />
              <Result label="Total payment" value={`₹ ${inr(result.totalPayment)}`} />
            </div>
            <div aria-label={`Principal ${plain(100 - interestShare, 1)} percent, interest ${plain(interestShare, 1)} percent`} role="img" className="flex h-3 overflow-hidden rounded-full bg-surface2">
              <div className="bg-accent" style={{ width: `${100 - interestShare}%` }} />
              <div className="bg-warning" style={{ width: `${interestShare}%` }} />
            </div>
            <p className="text-xs text-muted">
              <span className="text-accent">■</span> Principal {plain(100 - interestShare, 1)}% · <span className="text-warning">■</span> Interest {plain(interestShare, 1)}%
            </p>
            <Formula>EMI = P × r × (1+r)ⁿ ÷ ((1+r)ⁿ − 1), where r = annual rate ÷ 12 ÷ 100 and n = months</Formula>
            <Card className="overflow-hidden">
              <div className="flex items-center justify-between border-b border-line px-3 py-2">
                <h2 className="text-sm font-semibold">Amortisation schedule</h2>
                <DownloadTextButton text={csv} filename="emi-schedule.csv" mime="text/csv" label="CSV" />
              </div>
              <div className="max-h-[420px] overflow-auto">
                <table className="w-full text-right text-[13px] tabular-nums">
                  <thead className="sticky top-0 bg-surface2 text-xs text-muted">
                    <tr>
                      <th className="px-3 py-2 text-left">Month</th>
                      <th className="px-3 py-2">Principal</th>
                      <th className="px-3 py-2">Interest</th>
                      <th className="px-3 py-2">Balance</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-line">
                    {(showAll ? result.schedule : result.schedule.slice(0, 24)).map((s) => (
                      <tr key={s.month}>
                        <td className="px-3 py-1.5 text-left">{s.month}</td>
                        <td className="px-3 py-1.5">{inr(s.principal)}</td>
                        <td className="px-3 py-1.5">{inr(s.interest)}</td>
                        <td className="px-3 py-1.5">{inr(s.balance)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {result.schedule.length > 24 && (
                <div className="border-t border-line p-2 text-center">
                  <Button size="sm" variant="ghost" onClick={() => setShowAll(!showAll)}>
                    {showAll ? 'Show first 24 months' : `Show all ${result.schedule.length} months`}
                  </Button>
                </div>
              )}
            </Card>
          </>
        )}
      </div>
    </div>
  );
}

/* ---------- Units ---------- */

export function UnitConverterTool(_: { tool: ToolDefinition }) {
  const [catId, setCatId] = useState('length');
  const cat = UNIT_CATEGORIES.find((c) => c.id === catId)!;
  const [from, setFrom] = useState(cat.units[2]?.id ?? cat.units[0].id);
  const [to, setTo] = useState(cat.units[3]?.id ?? cat.units[1].id);
  const [value, setValue] = useState('1');

  const changeCat = (id: string) => {
    const c = UNIT_CATEGORIES.find((x) => x.id === id)!;
    setCatId(id);
    setFrom(c.units[0].id);
    setTo(c.units[1].id);
  };
  const fromU = cat.units.find((x) => x.id === from) ?? cat.units[0];
  const toU = cat.units.find((x) => x.id === to) ?? cat.units[1];
  const v = num(value);
  const result = convertUnit(v, fromU, toU);
  const formatted = formatValue(result);
  const opts = cat.units.map((x) => ({ value: x.id, label: x.label }));

  return (
    <div className="space-y-4">
      <div role="tablist" aria-label="Quantity" className="no-scrollbar flex gap-1 overflow-x-auto pb-1">
        {UNIT_CATEGORIES.map((c) => (
          <button key={c.id} role="tab" aria-selected={c.id === catId} onClick={() => changeCat(c.id)} className={clsx('min-h-[36px] shrink-0 rounded-md border px-3 text-sm', c.id === catId ? 'border-accent bg-accent/10 text-accent' : 'border-line bg-surface text-muted hover:text-fg')}>
            {c.label}
          </button>
        ))}
      </div>
      <Card className="p-4">
        <div className="grid items-end gap-3 md:grid-cols-[1fr_auto_1fr]">
          <div className="space-y-2">
            <NumField id="u-val" label="Value" value={value} onChange={setValue} />
            <Select label="From" value={from} onChange={(e) => setFrom(e.target.value)} options={opts} />
          </div>
          <Button size="icon" aria-label="Swap units" onClick={() => (setFrom(to), setTo(from))} className="mx-auto">
            <ArrowLeftRight size={16} />
          </Button>
          <div className="space-y-2">
            <div>
              <span className="label">Result</span>
              <div className="flex min-h-[40px] items-center justify-between gap-2 rounded-md border border-line bg-surface2 px-3">
                <output htmlFor="u-val" className="truncate font-semibold tabular-nums">
                  {Number.isFinite(v) ? formatted : '—'}
                </output>
                <CopyButton text={Number.isFinite(v) ? String(result) : ''} />
              </div>
            </div>
            <Select label="To" value={to} onChange={(e) => setTo(e.target.value)} options={opts} />
          </div>
        </div>
        {Number.isFinite(v) && (
          <p className="mt-3 text-sm text-muted">
            {formatValue(v)} {fromU.label} = <strong className="text-fg">{formatted}</strong> {toU.label}
          </p>
        )}
      </Card>
      <Card className="overflow-x-auto">
        <table className="w-full text-sm">
          <caption className="border-b border-line px-3 py-2 text-left text-xs font-semibold uppercase tracking-wide text-muted">
            {Number.isFinite(v) ? `${formatValue(v)} ${fromU.label} in every unit` : 'All units'}
          </caption>
          <tbody className="divide-y divide-line">
            {cat.units.map((x) => (
              <tr key={x.id} className={x.id === to ? 'bg-accent/5' : ''}>
                <td className="px-3 py-1.5 text-muted">{x.label}</td>
                <td className="px-3 py-1.5 text-right font-medium tabular-nums">{Number.isFinite(v) ? formatValue(convertUnit(v, fromU, x)) : '—'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>
      {catId === 'data' && <p className="text-xs text-muted">KB/MB/GB use powers of 1000 (SI). KiB/MiB/GiB use powers of 1024. Operating systems differ in which they display.</p>}
    </div>
  );
}
