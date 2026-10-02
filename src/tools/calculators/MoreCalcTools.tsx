import { useMemo, useRef, useState } from 'react';
import { clsx } from 'clsx';
import type { ToolDefinition, ToolPreset } from '@/types/tool';
import { Badge, Button, Card, Segmented, Select, TextInput, Toggle } from '@/components/ui/primitives';
import { CopyButton, DownloadTextButton, Formula } from '@/components/tools/common';
import { NumField, Result, inr, num, plain } from './CalcTools';
import { interest, bmi, bmiBand, healthyRange, BMI_BANDS, type Compounding, type BmiScale } from './logic';
import { evaluate, formatResult, CalcError, type AngleMode } from './expr';
import { parseDate, formatYmd, todayYmd, age, ymdDiff, daysBetween, workingDays, addToDate, toUtc, type Ymd } from './dates';

/* ---------- Interest ---------- */

const COMPOUNDING: { value: string; label: string }[] = [
  { value: '1', label: 'Yearly' },
  { value: '2', label: 'Half-yearly' },
  { value: '4', label: 'Quarterly (Indian bank FDs)' },
  { value: '12', label: 'Monthly' },
  { value: '365', label: 'Daily' },
  { value: '0', label: 'Continuous' },
];

export function InterestTool({ preset }: { tool: ToolDefinition; preset?: ToolPreset }) {
  const [p, setP] = useState(String(preset?.amount ?? '100000'));
  const [rate, setRate] = useState(String(preset?.rate ?? '7'));
  const [years, setYears] = useState(String(preset?.years ?? '5'));
  const [freq, setFreq] = useState(String(preset?.compounding ?? '4'));
  const [monthly, setMonthly] = useState(String(preset?.monthly ?? '0'));
  const res = useMemo(() => {
    try {
      return interest(num(p) || 0, num(rate), num(years), Number(freq) as Compounding, num(monthly) || 0);
    } catch (err) {
      return { error: (err as Error).message };
    }
  }, [p, rate, years, freq, monthly]);
  const ok = !('error' in res) ? res : null;
  const csv = ok ? ['Year,Deposited,Interest,Balance', ...ok.rows.map((r) => [r.year, r.deposited, r.interest, r.balance].map((v) => (typeof v === 'number' ? v.toFixed(2) : v)).join(','))].join('\n') : '';

  return (
    <div className="grid gap-4 lg:grid-cols-[320px_1fr]">
      <Card className="h-fit space-y-4 p-4">
        <NumField id="i-p" label="Starting amount (₹)" value={p} onChange={setP} />
        <NumField id="i-r" label="Interest rate (per year)" value={rate} onChange={setRate} suffix="%" />
        <NumField id="i-y" label="Period (years)" value={years} onChange={setYears} suffix="yrs" />
        <Select label="Compounding" value={freq} onChange={(e) => setFreq(e.target.value)} options={COMPOUNDING} />
        <NumField id="i-m" label="Monthly deposit (₹, optional)" value={monthly} onChange={setMonthly} />
      </Card>
      <div className="min-w-0 space-y-3">
        {!ok ? (
          <p className="text-sm text-error">{'error' in res ? res.error : ''}</p>
        ) : (
          <>
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
              <Result label="Maturity value" value={`₹ ${inr(ok.maturity)}`} big />
              <Result label="Total interest earned" value={`₹ ${inr(ok.interest)}`} />
              <Result label="Total deposited" value={`₹ ${inr(ok.deposited)}`} />
              <Result label="Effective annual rate" value={`${plain(ok.ear, 3)}%`} />
              {(num(monthly) || 0) === 0 && <Result label="Simple interest (for comparison)" value={`₹ ${inr(ok.simpleInterest)}`} />}
              {(num(monthly) || 0) === 0 && <Result label="Extra from compounding" value={`₹ ${inr(ok.interest - ok.simpleInterest)}`} />}
            </div>
            <Formula>
              {freq === '0' ? 'A = P × e^(r × t)' : 'A = P × (1 + r ÷ n)^(n × t)'}
              {(num(monthly) || 0) > 0 ? ' + D × ((1 + i)^m − 1) ÷ i, where i is the equivalent monthly rate and m the number of deposits' : ''} · Simple interest = P × r × t
            </Formula>
            <Card className="overflow-hidden">
              <div className="flex items-center justify-between border-b border-line px-3 py-2">
                <h2 className="text-sm font-semibold">Year by year</h2>
                <DownloadTextButton text={csv} filename="interest-schedule.csv" mime="text/csv" label="CSV" />
              </div>
              <div className="max-h-[420px] overflow-auto">
                <table className="w-full text-right text-[13px] tabular-nums">
                  <thead className="sticky top-0 bg-surface2 text-xs text-muted">
                    <tr>
                      <th className="px-3 py-2 text-left">Year</th>
                      <th className="px-3 py-2">Deposited</th>
                      <th className="px-3 py-2">Interest</th>
                      <th className="px-3 py-2">Balance</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-line">
                    {ok.rows.map((r) => (
                      <tr key={r.year}>
                        <td className="px-3 py-1.5 text-left">{r.year}</td>
                        <td className="px-3 py-1.5">{inr(r.deposited)}</td>
                        <td className="px-3 py-1.5">{inr(r.interest)}</td>
                        <td className="px-3 py-1.5">{inr(r.balance)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </Card>
            <p className="text-xs text-muted">Bank FDs in India usually compound quarterly. Interest may be taxable and TDS may apply; actual payouts can differ slightly with bank rounding.</p>
          </>
        )}
      </div>
    </div>
  );
}

/* ---------- Scientific ---------- */

const KEYS: { label: string; insert?: string; action?: 'clear' | 'back' | 'eval'; tone?: 'fn' | 'op' | 'eq' }[][] = [
  [{ label: 'sin', insert: 'sin(', tone: 'fn' }, { label: 'cos', insert: 'cos(', tone: 'fn' }, { label: 'tan', insert: 'tan(', tone: 'fn' }, { label: 'ln', insert: 'ln(', tone: 'fn' }, { label: 'log', insert: 'log(', tone: 'fn' }],
  [{ label: 'sin⁻¹', insert: 'asin(', tone: 'fn' }, { label: 'cos⁻¹', insert: 'acos(', tone: 'fn' }, { label: 'tan⁻¹', insert: 'atan(', tone: 'fn' }, { label: 'eˣ', insert: 'exp(', tone: 'fn' }, { label: '10ˣ', insert: '10^', tone: 'fn' }],
  [{ label: 'x²', insert: '^2', tone: 'fn' }, { label: 'xʸ', insert: '^', tone: 'fn' }, { label: '√', insert: 'sqrt(', tone: 'fn' }, { label: 'x!', insert: '!', tone: 'fn' }, { label: 'nCr', insert: 'nCr(', tone: 'fn' }],
  [{ label: '(', insert: '(' }, { label: ')', insert: ')' }, { label: 'π', insert: 'π' }, { label: 'e', insert: 'e' }, { label: '%', insert: '%' }],
  [{ label: '7', insert: '7' }, { label: '8', insert: '8' }, { label: '9', insert: '9' }, { label: '÷', insert: '÷', tone: 'op' }, { label: 'AC', action: 'clear', tone: 'op' }],
  [{ label: '4', insert: '4' }, { label: '5', insert: '5' }, { label: '6', insert: '6' }, { label: '×', insert: '×', tone: 'op' }, { label: '⌫', action: 'back', tone: 'op' }],
  [{ label: '1', insert: '1' }, { label: '2', insert: '2' }, { label: '3', insert: '3' }, { label: '−', insert: '-', tone: 'op' }, { label: 'Ans', insert: 'ans', tone: 'op' }],
  [{ label: '0', insert: '0' }, { label: '.', insert: '.' }, { label: ',', insert: ',' }, { label: '+', insert: '+', tone: 'op' }, { label: '=', action: 'eval', tone: 'eq' }],
];

export function ScientificTool(_: { tool: ToolDefinition }) {
  const [input, setInput] = useState('');
  const [angle, setAngle] = useState<AngleMode>('deg');
  const [ans, setAns] = useState<number | undefined>();
  const [history, setHistory] = useState<{ expr: string; result: string }[]>([]);
  const [error, setError] = useState('');
  const ref = useRef<HTMLInputElement>(null);

  const preview = useMemo(() => {
    if (!input.trim()) return '';
    try {
      return formatResult(evaluate(input, { angle, ans }));
    } catch {
      return '';
    }
  }, [input, angle, ans]);

  const run = () => {
    if (!input.trim()) return;
    try {
      const v = evaluate(input, { angle, ans });
      const shown = formatResult(v);
      setHistory((h) => [{ expr: input, result: shown }, ...h].slice(0, 30));
      setAns(v);
      setInput(shown === '∞' || shown === '−∞' ? '' : shown.replace('−', '-'));
      setError('');
    } catch (err) {
      setError(err instanceof CalcError ? err.message : 'That expression could not be calculated.');
    }
  };

  const insert = (s: string) => {
    const el = ref.current;
    const start = el?.selectionStart ?? input.length;
    const end = el?.selectionEnd ?? input.length;
    const next = input.slice(0, start) + s + input.slice(end);
    setInput(next);
    setError('');
    requestAnimationFrame(() => {
      el?.focus();
      el?.setSelectionRange(start + s.length, start + s.length);
    });
  };

  const press = (k: (typeof KEYS)[number][number]) => {
    if (k.action === 'clear') {
      setInput('');
      setError('');
    } else if (k.action === 'back') {
      const el = ref.current;
      const pos = el?.selectionStart ?? input.length;
      if (pos > 0) {
        setInput(input.slice(0, pos - 1) + input.slice(pos));
        requestAnimationFrame(() => el?.setSelectionRange(pos - 1, pos - 1));
      }
    } else if (k.action === 'eval') run();
    else if (k.insert) insert(k.insert);
  };

  return (
    <div className="grid gap-4 lg:grid-cols-[minmax(0,420px)_1fr]">
      <Card className="space-y-3 p-4">
        <div className="flex items-center justify-between">
          <Segmented label="Angle unit" value={angle} onChange={setAngle} options={[{ value: 'deg', label: 'Degrees' }, { value: 'rad', label: 'Radians' }]} />
        </div>
        <div className="rounded-lg border border-line bg-surface2 p-3">
          <label htmlFor="sci-in" className="sr-only">
            Expression
          </label>
          <input
            id="sci-in"
            ref={ref}
            value={input}
            onChange={(e) => {
              setInput(e.target.value);
              setError('');
            }}
            onKeyDown={(e) => {
              if (e.key === 'Enter' || e.key === '=') {
                e.preventDefault();
                run();
              } else if (e.key === 'Escape') setInput('');
            }}
            autoComplete="off"
            spellCheck={false}
            inputMode="text"
            placeholder="e.g. 2 × sin(30) + √16"
            className="w-full bg-transparent text-right font-mono text-xl text-fg outline-none"
          />
          <p aria-live="polite" className={clsx('min-h-[1.5rem] text-right font-mono text-sm', error ? 'text-error' : 'text-muted')}>
            {error || (preview && preview !== input ? `= ${preview}` : '')}
          </p>
        </div>
        <div className="grid grid-cols-5 gap-1.5" role="group" aria-label="Calculator keypad">
          {KEYS.flat().map((k) => (
            <button
              key={k.label}
              onClick={() => press(k)}
              aria-label={k.label === '⌫' ? 'Backspace' : k.label === 'AC' ? 'Clear' : undefined}
              className={clsx(
                'h-11 rounded-md border text-[15px] font-medium transition-colors active:scale-[0.97]',
                k.tone === 'eq' ? 'border-transparent bg-accent text-accent-fg hover:bg-accent/90' : k.tone === 'op' ? 'border-line bg-surface2 text-fg hover:bg-surface' : k.tone === 'fn' ? 'border-line bg-surface text-[13px] text-muted hover:text-fg' : 'border-line bg-surface text-fg hover:bg-surface2',
              )}
            >
              {k.label}
            </button>
          ))}
        </div>
        <p className="text-xs text-muted">Type with your keyboard too — Enter to calculate. Functions: sin, cos, tan, asin, acos, atan, sinh…, ln, log, log2, exp, sqrt, cbrt, root(x, n), abs, round, floor, ceil, nCr(n, r), nPr(n, r), min, max; x mod y; constants π, e, ans.</p>
      </Card>
      <Card className="h-fit overflow-hidden">
        <div className="flex items-center justify-between border-b border-line px-3 py-2">
          <h2 className="text-sm font-semibold">History</h2>
          {history.length > 0 && (
            <Button size="sm" variant="ghost" onClick={() => setHistory([])}>
              Clear
            </Button>
          )}
        </div>
        {history.length ? (
          <ul className="max-h-[480px] divide-y divide-line overflow-auto">
            {history.map((h, i) => (
              <li key={i} className="flex items-center justify-between gap-3 px-3 py-2">
                <button className="min-w-0 flex-1 text-left" onClick={() => setInput(h.expr)} title="Use this expression">
                  <span className="block truncate font-mono text-sm text-muted">{h.expr}</span>
                  <span className="block truncate font-mono text-base font-semibold text-fg">= {h.result}</span>
                </button>
                <CopyButton text={h.result} label="Copy" />
              </li>
            ))}
          </ul>
        ) : (
          <p className="px-3 py-6 text-center text-sm text-muted">Results appear here. Tap one to reuse it.</p>
        )}
      </Card>
    </div>
  );
}

/* ---------- Date & age ---------- */

const fmtLong = (v: Ymd) => new Date(toUtc(v)).toLocaleDateString(undefined, { timeZone: 'UTC', weekday: 'short', day: 'numeric', month: 'long', year: 'numeric' });
const plural = (n: number, w: string) => `${n.toLocaleString()} ${w}${Math.abs(n) === 1 ? '' : 's'}`;

function DateField({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) {
  return <TextInput label={label} type="date" value={value} onChange={(e) => onChange(e.target.value)} />;
}

export function DateTool({ preset }: { tool: ToolDefinition; preset?: ToolPreset }) {
  const today = formatYmd(todayYmd());
  const [mode, setMode] = useState<'age' | 'diff' | 'add'>(preset?.mode === 'diff' || preset?.mode === 'add' ? preset.mode : 'age');
  const [birth, setBirth] = useState('1995-08-15');
  const [on, setOn] = useState(today);
  const [from, setFrom] = useState(today);
  const [to, setTo] = useState(formatYmd(addToDate(todayYmd(), { months: 3 })));
  const [includeEnd, setIncludeEnd] = useState(false);
  const [base, setBase] = useState(today);
  const [sign, setSign] = useState<'add' | 'sub'>('add');
  const [amt, setAmt] = useState({ years: '0', months: '0', weeks: '0', days: '30' });

  const content = (() => {
    if (mode === 'age') {
      const b = parseDate(birth);
      const o = parseDate(on);
      if (!b || !o) return <p className="text-sm text-muted">Choose both dates.</p>;
      const a = age(b, o);
      if (!a) return <p className="text-sm text-error">The date of birth is after the “age on” date.</p>;
      return (
        <div className="space-y-3">
          <Result label="Age" value={`${plural(a.years, 'year')}, ${plural(a.months, 'month')}, ${plural(a.days, 'day')}`} big />
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            <Result label="Total months" value={a.totalMonths.toLocaleString()} />
            <Result label="Total weeks" value={a.totalWeeks.toLocaleString()} />
            <Result label="Total days" value={a.totalDays.toLocaleString()} />
            <Result label="Born on a" value={a.bornOn} />
          </div>
          <p className="text-sm text-muted">
            Next birthday: <strong className="text-fg">{fmtLong(a.nextBirthday)}</strong> — {a.daysToBirthday === 0 ? 'today! 🎉' : `in ${plural(a.daysToBirthday, 'day')}`}.
            {b.m === 2 && b.d === 29 && ' In common years a 29 February birthday is counted on 28 February.'}
          </p>
        </div>
      );
    }
    if (mode === 'diff') {
      const a = parseDate(from);
      const b = parseDate(to);
      if (!a || !b) return <p className="text-sm text-muted">Choose both dates.</p>;
      const days = daysBetween(a, b) + (includeEnd ? Math.sign(daysBetween(a, b) || 1) : 0);
      const [lo, hi] = toUtc(a) <= toUtc(b) ? [a, b] : [b, a];
      const ymd = ymdDiff(lo, includeEnd ? addToDate(hi, { days: 1 }) : hi);
      return (
        <div className="space-y-3">
          <Result label="Difference" value={plural(Math.abs(days), 'day')} big />
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            <Result label="Years, months, days" value={`${ymd.years}y ${ymd.months}m ${ymd.days}d`} />
            <Result label="Weeks and days" value={`${Math.floor(Math.abs(days) / 7)}w ${Math.abs(days) % 7}d`} />
            <Result label="Working days (Mon–Fri)" value={workingDays(a, b, includeEnd).toLocaleString()} />
            <Result label="Hours" value={(Math.abs(days) * 24).toLocaleString()} />
          </div>
          {toUtc(b) < toUtc(a) && <p className="text-xs text-muted">The end date is before the start date; the difference is shown as a positive number.</p>}
        </div>
      );
    }
    const s = parseDate(base);
    if (!s) return <p className="text-sm text-muted">Choose a date.</p>;
    const k = sign === 'add' ? 1 : -1;
    const r = addToDate(s, { years: k * (num(amt.years) || 0), months: k * (num(amt.months) || 0), weeks: k * (num(amt.weeks) || 0), days: k * (num(amt.days) || 0) });
    return (
      <div className="space-y-3">
        <Result label="Result" value={fmtLong(r)} big />
        <div className="flex items-center gap-2 text-sm text-muted">
          <span className="font-mono">{formatYmd(r)}</span> <CopyButton text={formatYmd(r)} />
        </div>
        <p className="text-xs text-muted">Years and months are added first; if the day does not exist in the target month it moves to the month’s last day (31 January + 1 month = 28 February in a common year).</p>
      </div>
    );
  })();

  return (
    <div className="grid gap-4 lg:grid-cols-[340px_1fr]">
      <Card className="h-fit space-y-4 p-4">
        <Segmented label="Calculate" value={mode} onChange={setMode} options={[{ value: 'age', label: 'Age' }, { value: 'diff', label: 'Between dates' }, { value: 'add', label: 'Add / subtract' }]} />
        {mode === 'age' && (
          <>
            <DateField label="Date of birth" value={birth} onChange={setBirth} />
            <DateField label="Age on" value={on} onChange={setOn} />
          </>
        )}
        {mode === 'diff' && (
          <>
            <DateField label="Start date" value={from} onChange={setFrom} />
            <DateField label="End date" value={to} onChange={setTo} />
            <Toggle checked={includeEnd} onChange={setIncludeEnd} label="Include the end date" description="Counts both the first and last day (e.g. for leave or rentals)." />
          </>
        )}
        {mode === 'add' && (
          <>
            <DateField label="Start date" value={base} onChange={setBase} />
            <Segmented label="Operation" value={sign} onChange={setSign} options={[{ value: 'add', label: 'Add' }, { value: 'sub', label: 'Subtract' }]} />
            <div className="grid grid-cols-2 gap-2">
              {(['years', 'months', 'weeks', 'days'] as const).map((f) => (
                <NumField key={f} id={`d-${f}`} label={f[0].toUpperCase() + f.slice(1)} value={amt[f]} onChange={(v) => setAmt({ ...amt, [f]: v })} />
              ))}
            </div>
          </>
        )}
      </Card>
      <div className="min-w-0">{content}</div>
    </div>
  );
}

/* ---------- BMI ---------- */

export function BmiTool(_: { tool: ToolDefinition }) {
  const [units, setUnits] = useState<'metric' | 'imperial'>('metric');
  const [scale, setScale] = useState<BmiScale>('asian');
  const [kg, setKg] = useState('68');
  const [cm, setCm] = useState('170');
  const [lb, setLb] = useState('150');
  const [ft, setFt] = useState('5');
  const [inch, setInch] = useState('7');

  const weight = units === 'metric' ? num(kg) : num(lb) * 0.45359237;
  const height = units === 'metric' ? num(cm) : ((num(ft) || 0) * 12 + (num(inch) || 0)) * 2.54;
  let value = NaN;
  try {
    value = bmi(weight, height);
  } catch {
    /* incomplete input */
  }
  const ok = Number.isFinite(value) && height > 50 && height < 280 && weight > 10 && weight < 500;
  const band = ok ? bmiBand(value, scale) : null;
  const [lo, hi] = ok ? healthyRange(height, scale) : [NaN, NaN];
  const toUnit = (k: number) => (units === 'metric' ? `${plain(k, 1)} kg` : `${plain(k / 0.45359237, 1)} lb`);
  const bands = BMI_BANDS[scale];
  const pos = ok ? Math.min(100, Math.max(0, ((value - 15) / (40 - 15)) * 100)) : 0;

  return (
    <div className="grid gap-4 lg:grid-cols-[340px_1fr]">
      <Card className="h-fit space-y-4 p-4">
        <Segmented label="Units" value={units} onChange={setUnits} options={[{ value: 'metric', label: 'kg / cm' }, { value: 'imperial', label: 'lb / ft-in' }]} />
        {units === 'metric' ? (
          <>
            <NumField id="b-kg" label="Weight" value={kg} onChange={setKg} suffix="kg" />
            <NumField id="b-cm" label="Height" value={cm} onChange={setCm} suffix="cm" />
          </>
        ) : (
          <>
            <NumField id="b-lb" label="Weight" value={lb} onChange={setLb} suffix="lb" />
            <div className="grid grid-cols-2 gap-2">
              <NumField id="b-ft" label="Height" value={ft} onChange={setFt} suffix="ft" />
              <NumField id="b-in" label={" "} value={inch} onChange={setInch} suffix="in" />
            </div>
          </>
        )}
        <Segmented label="Categories" value={scale} onChange={setScale} options={[{ value: 'asian', label: 'Asian / Indian' }, { value: 'who', label: 'WHO international' }]} />
        <p className="text-xs text-muted">South Asians face higher health risks at lower BMI, so Indian guidelines use lower cut-offs (overweight from 23, obesity from 25).</p>
      </Card>
      <div className="min-w-0 space-y-3">
        {!ok || !band ? (
          <p className="text-sm text-muted">Enter an adult weight and height.</p>
        ) : (
          <>
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
              <Result label="Your BMI" value={value.toFixed(1)} big />
              <div className="rounded-lg border border-line bg-surface p-3">
                <p className="text-xs text-muted">Category</p>
                <p className="mt-1">
                  <Badge tone={band.tone === 'info' ? 'accent' : band.tone}>{band.label}</Badge>
                </p>
              </div>
              <Result label="Healthy weight for your height" value={`${toUnit(lo)} – ${toUnit(hi)}`} />
            </div>
            <div>
              <div className="relative h-3 overflow-hidden rounded-full" role="img" aria-label={`BMI ${value.toFixed(1)} on a scale from 15 to 40`}>
                <div className="absolute inset-0 flex">
                  {bands.map((b, i) => {
                    const start = Math.max(15, b.min);
                    const end = Math.min(40, bands[i + 1]?.min ?? 40);
                    return <div key={b.label} className={clsx(b.tone === 'info' && 'bg-info/60', b.tone === 'success' && 'bg-success/70', b.tone === 'warning' && 'bg-warning/70', b.tone === 'error' && 'bg-error/70')} style={{ width: `${((end - start) / 25) * 100}%` }} />;
                  })}
                </div>
              </div>
              <div className="relative h-4">
                <span className="absolute -translate-x-1/2 text-xs font-semibold text-fg" style={{ left: `${pos}%` }}>
                  ▲
                </span>
              </div>
              <div className="flex justify-between text-[11px] text-muted">
                <span>15</span>
                <span>40</span>
              </div>
            </div>
            <Formula>BMI = weight (kg) ÷ height (m)²{units === 'imperial' ? ' = 703 × weight (lb) ÷ height (in)²' : ''}</Formula>
            <p className="text-xs text-muted">BMI is a screening number for adults. It does not measure body fat, and muscular people, older adults, pregnant women and children need different assessments. For children and teens, use BMI-for-age charts. Talk to a doctor about your health.</p>
          </>
        )}
      </div>
    </div>
  );
}
