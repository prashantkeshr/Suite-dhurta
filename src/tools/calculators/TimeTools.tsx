import { useMemo, useState } from 'react';
import { Plus, Trash2, ArrowLeftRight } from 'lucide-react';
import type { ToolDefinition, ToolPreset } from '@/types/tool';
import { Button, Card, Segmented, Toggle } from '@/components/ui/primitives';
import { CopyButton, DownloadTextButton, Formula } from '@/components/tools/common';
import { Result } from './CalcTools';
import { parseDuration, formatHms, formatWords, parseClock, formatClock, timeBetween, addToClock, zoneOffset, zonedToInstant, formatOffset } from './time';

const dec = (secs: number) => (secs / 3600).toLocaleString(undefined, { maximumFractionDigits: 2 });

function Field({ id, label, value, onChange, placeholder, invalid, className }: { id: string; label: string; value: string; onChange: (v: string) => void; placeholder?: string; invalid?: boolean; className?: string }) {
  return (
    <div className={className}>
      <label htmlFor={id} className="label">
        {label}
      </label>
      <input id={id} className={`input tabular-nums ${invalid ? 'border-error' : ''}`} value={value} placeholder={placeholder} aria-invalid={invalid || undefined} onChange={(e) => onChange(e.target.value)} />
    </div>
  );
}

/* ---------- Durations: add and subtract ---------- */

function Durations() {
  const [rows, setRows] = useState([
    { sign: 1, text: '2:45' },
    { sign: 1, text: '1h 20m' },
    { sign: -1, text: '30m' },
  ]);
  const parsed = rows.map((r) => parseDuration(r.text));
  const total = parsed.reduce((a, v, i) => a + (Number.isFinite(v) ? v * rows[i].sign : 0), 0);
  const set = (i: number, patch: Partial<(typeof rows)[number]>) => setRows(rows.map((r, k) => (k === i ? { ...r, ...patch } : r)));

  return (
    <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
      <Card className="space-y-2 p-4">
        <p className="text-sm text-muted">Type durations like 1:30, 1h 30m, 90m or 1.5h.</p>
        {rows.map((r, i) => (
          <div key={i} className="flex items-center gap-2">
            <button onClick={() => set(i, { sign: -r.sign })} className="h-10 w-10 shrink-0 rounded-md border border-line text-lg font-semibold hover:bg-surface2" aria-label={r.sign > 0 ? 'Adding — switch to subtract' : 'Subtracting — switch to add'}>
              {r.sign > 0 ? '+' : '−'}
            </button>
            <input className={`input tabular-nums ${r.text && !Number.isFinite(parsed[i]) ? 'border-error' : ''}`} value={r.text} aria-label={`Duration ${i + 1}`} onChange={(e) => set(i, { text: e.target.value })} placeholder="e.g. 1h 15m" />
            <span className="w-24 shrink-0 text-right text-sm tabular-nums text-muted">{Number.isFinite(parsed[i]) ? formatHms(parsed[i] * r.sign) : r.text ? 'not a time' : ''}</span>
            <Button size="icon" variant="ghost" aria-label="Remove row" onClick={() => setRows(rows.filter((_, k) => k !== i))} disabled={rows.length === 1}>
              <Trash2 size={15} />
            </Button>
          </div>
        ))}
        <Button size="sm" icon={<Plus size={14} />} onClick={() => setRows([...rows, { sign: 1, text: '' }])}>
          Add row
        </Button>
      </Card>
      <div className="space-y-2">
        <Result label="Total (h:mm:ss)" value={formatHms(total)} big />
        <div className="grid grid-cols-2 gap-2">
          <Result label="In words" value={formatWords(total)} />
          <Result label="Decimal hours" value={dec(total)} />
          <Result label="Total minutes" value={(total / 60).toLocaleString(undefined, { maximumFractionDigits: 2 })} />
          <Result label="Total seconds" value={total.toLocaleString()} />
        </div>
        <CopyButton text={formatHms(total)} label="Copy total" />
      </div>
    </div>
  );
}

/* ---------- Timesheet: time between clock times ---------- */

function Timesheet() {
  const [h12, setH12] = useState(false);
  const [rows, setRows] = useState([
    { start: '09:00', end: '17:30', brk: '30' },
    { start: '22:00', end: '06:00', brk: '0' },
  ]);
  const calc = rows.map((r) => {
    const s = parseClock(r.start);
    const e = parseClock(r.end);
    const b = parseDuration(r.brk || '0');
    return Number.isFinite(s) && Number.isFinite(e) && Number.isFinite(b) ? timeBetween(s, e, b) : null;
  });
  const total = calc.reduce((a, c) => a + (c?.secs ?? 0), 0);
  const set = (i: number, patch: Partial<(typeof rows)[number]>) => setRows(rows.map((r, k) => (k === i ? { ...r, ...patch } : r)));
  const csv = ['Start,End,Break (min),Hours (h:mm),Decimal hours', ...rows.map((r, i) => [r.start, r.end, r.brk, calc[i] ? formatHms(calc[i]!.secs) : '', calc[i] ? dec(calc[i]!.secs) : ''].join(',')), `,,Total,${formatHms(total)},${dec(total)}`].join('\n');

  return (
    <div className="space-y-3">
      <Card className="overflow-x-auto p-3">
        <table className="w-full min-w-[560px] text-sm">
          <thead className="text-xs text-muted">
            <tr>
              <th className="px-1 pb-1 text-left font-medium">Start</th>
              <th className="px-1 pb-1 text-left font-medium">End</th>
              <th className="px-1 pb-1 text-left font-medium">Break (min)</th>
              <th className="px-1 pb-1 text-right font-medium">Worked</th>
              <th className="w-10" />
            </tr>
          </thead>
          <tbody>
            {rows.map((r, i) => (
              <tr key={i}>
                <td className="p-1">
                  <input className={`input tabular-nums ${r.start && !Number.isFinite(parseClock(r.start)) ? 'border-error' : ''}`} value={r.start} aria-label={`Start ${i + 1}`} onChange={(e) => set(i, { start: e.target.value })} placeholder="09:00" />
                </td>
                <td className="p-1">
                  <input className={`input tabular-nums ${r.end && !Number.isFinite(parseClock(r.end)) ? 'border-error' : ''}`} value={r.end} aria-label={`End ${i + 1}`} onChange={(e) => set(i, { end: e.target.value })} placeholder="17:30" />
                </td>
                <td className="p-1">
                  <input className="input tabular-nums" value={r.brk} aria-label={`Break ${i + 1}`} onChange={(e) => set(i, { brk: e.target.value })} placeholder="0" />
                </td>
                <td className="p-1 text-right tabular-nums">
                  {calc[i] ? (
                    <>
                      {formatHms(calc[i]!.secs).replace(/:00$/, '')}
                      {calc[i]!.overnight && <span className="ml-1 text-xs text-muted">(overnight)</span>}
                    </>
                  ) : (
                    <span className="text-muted">—</span>
                  )}
                </td>
                <td className="p-1">
                  <Button size="icon" variant="ghost" aria-label="Remove row" onClick={() => setRows(rows.filter((_, k) => k !== i))} disabled={rows.length === 1}>
                    <Trash2 size={15} />
                  </Button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        <div className="mt-2 flex flex-wrap items-center gap-2">
          <Button size="sm" icon={<Plus size={14} />} onClick={() => setRows([...rows, { start: '', end: '', brk: '0' }])}>
            Add day
          </Button>
          <Toggle checked={h12} onChange={setH12} label="Show 12-hour times" />
        </div>
      </Card>
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
        <Result label="Total worked" value={formatHms(total).replace(/:00$/, '')} big />
        <Result label="Decimal hours (for payroll)" value={dec(total)} />
        <Result label="In words" value={formatWords(total)} />
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <DownloadTextButton text={csv} filename="timesheet.csv" mime="text/csv" label="Timesheet CSV" />
        <span className="text-xs text-muted">Times accept 9:30, 21:30, 9:30 pm or 930. An end earlier than the start counts as an overnight shift.{h12 && rows[0] && Number.isFinite(parseClock(rows[0].start)) ? ` First start: ${formatClock(parseClock(rows[0].start), true)}.` : ''}</span>
      </div>
    </div>
  );
}

/* ---------- Clock + duration ---------- */

function ClockMath() {
  const [clock, setClock] = useState('22:15');
  const [dur, setDur] = useState('3h 50m');
  const [sign, setSign] = useState<'add' | 'sub'>('add');
  const c = parseClock(clock);
  const d = parseDuration(dur);
  const ok = Number.isFinite(c) && Number.isFinite(d);
  const r = ok ? addToClock(c, sign === 'add' ? d : -d) : null;
  return (
    <div className="grid gap-4 lg:grid-cols-[340px_1fr]">
      <Card className="h-fit space-y-3 p-4">
        <Field id="cm-clock" label="Start time" value={clock} onChange={setClock} placeholder="22:15 or 10:15 pm" invalid={!!clock && !Number.isFinite(c)} />
        <Segmented label="Operation" value={sign} onChange={setSign} options={[{ value: 'add', label: 'Add' }, { value: 'sub', label: 'Subtract' }]} />
        <Field id="cm-dur" label="Duration" value={dur} onChange={setDur} placeholder="3h 50m or 3:50" invalid={!!dur && !Number.isFinite(d)} />
      </Card>
      <div className="space-y-2">
        {r ? (
          <>
            <Result label="Result" value={`${formatClock(r.clock)}  ·  ${formatClock(r.clock, true)}`} big />
            <p className="text-sm text-muted">{r.dayOffset === 0 ? 'Same day.' : r.dayOffset > 0 ? `${r.dayOffset} day${r.dayOffset > 1 ? 's' : ''} later.` : `${-r.dayOffset} day${r.dayOffset < -1 ? 's' : ''} earlier.`}</p>
            <Formula>{`${formatClock(c)} ${sign === 'add' ? '+' : '−'} ${formatHms(d)} = ${formatClock(r.clock)}${r.dayOffset ? ` (${r.dayOffset > 0 ? '+' : ''}${r.dayOffset} d)` : ''}`}</Formula>
          </>
        ) : (
          <p className="text-sm text-muted">Enter a start time and a duration.</p>
        )}
      </div>
    </div>
  );
}

/* ---------- Conversions ---------- */

function Convert() {
  const [decimal, setDecimal] = useState('7.75');
  const [hms, setHms] = useState('7:45');
  const d = Number(decimal.replace(',', '.'));
  const h = parseDuration(hms);
  return (
    <div className="grid gap-4 md:grid-cols-2">
      <Card className="space-y-3 p-4">
        <h2 className="text-sm font-semibold">Decimal hours → hours and minutes</h2>
        <Field id="cv-dec" label="Decimal hours" value={decimal} onChange={setDecimal} placeholder="7.75" invalid={!!decimal && !Number.isFinite(d)} />
        <Result label="Hours and minutes" value={Number.isFinite(d) ? `${formatHms(d * 3600).replace(/:00$/, '')}  (${formatWords(d * 3600)})` : '—'} big />
        <Formula>minutes = decimal part × 60 (e.g. 0.75 h = 45 min)</Formula>
      </Card>
      <Card className="space-y-3 p-4">
        <h2 className="text-sm font-semibold">Hours and minutes → decimal hours</h2>
        <Field id="cv-hms" label="Duration" value={hms} onChange={setHms} placeholder="7:45 or 7h 45m" invalid={!!hms && !Number.isFinite(h)} />
        <Result label="Decimal hours" value={Number.isFinite(h) ? (h / 3600).toLocaleString(undefined, { maximumFractionDigits: 4 }) : '—'} big />
        <Formula>decimal = hours + minutes ÷ 60 (e.g. 45 min = 0.75 h)</Formula>
      </Card>
    </div>
  );
}

export function TimeCalculatorTool({ preset }: { tool: ToolDefinition; preset?: ToolPreset }) {
  const initial = ['durations', 'timesheet', 'clock', 'convert'].includes(String(preset?.mode)) ? (preset!.mode as 'durations') : 'durations';
  const [mode, setMode] = useState<'durations' | 'timesheet' | 'clock' | 'convert'>(initial);
  return (
    <div className="space-y-4">
      <Segmented
        label="Calculate"
        value={mode}
        onChange={setMode}
        options={[
          { value: 'durations', label: 'Add / subtract time' },
          { value: 'timesheet', label: 'Hours worked' },
          { value: 'clock', label: 'Time + duration' },
          { value: 'convert', label: 'Decimal hours' },
        ]}
      />
      {mode === 'durations' && <Durations />}
      {mode === 'timesheet' && <Timesheet />}
      {mode === 'clock' && <ClockMath />}
      {mode === 'convert' && <Convert />}
    </div>
  );
}

/* ---------- Time zones ---------- */

const POPULAR = ['Asia/Kolkata', 'UTC', 'America/New_York', 'America/Chicago', 'America/Los_Angeles', 'Europe/London', 'Europe/Berlin', 'Asia/Dubai', 'Asia/Singapore', 'Asia/Tokyo', 'Australia/Sydney', 'Asia/Kathmandu', 'Asia/Dhaka'];
const allZones = (): string[] => {
  try {
    return (Intl as unknown as { supportedValuesOf(k: string): string[] }).supportedValuesOf('timeZone');
  } catch {
    return POPULAR;
  }
};
/** Valid IANA zone (including aliases like Asia/Calcutta ↔ Asia/Kolkata)? */
export const isZone = (z: string) => {
  if (!z.trim()) return false;
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: z });
    return true;
  } catch {
    return false;
  }
};
const canonical = (z: string) => {
  try {
    return new Intl.DateTimeFormat('en-US', { timeZone: z }).resolvedOptions().timeZone;
  } catch {
    return z;
  }
};
const localZone = () => Intl.DateTimeFormat().resolvedOptions().timeZone || 'Asia/Kolkata';
const pad = (n: number) => String(n).padStart(2, '0');

export function TimeZoneTool({ preset }: { tool: ToolDefinition; preset?: ToolPreset }) {
  const now = new Date();
  const [date, setDate] = useState(`${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`);
  const [time, setTime] = useState(`${pad(now.getHours())}:${pad(now.getMinutes())}`);
  const [from, setFrom] = useState(String(preset?.from ?? localZone()));
  const [targets, setTargets] = useState<string[]>(() => {
    const t = (preset?.to ? String(preset.to).split(',') : POPULAR.slice(0, 7)).filter((z) => z !== String(preset?.from ?? localZone()));
    return t;
  });
  const [adding, setAdding] = useState('');
  const zones = useMemo(allZones, []);

  const [y, mo, d] = date.split('-').map(Number);
  const [hh, mm] = time.split(':').map(Number);
  const valid = [y, mo, d, hh, mm].every(Number.isFinite) && isZone(from);
  const instant = valid ? zonedToInstant(y, mo, d, hh, mm, from) : NaN;

  const show = (zone: string) => {
    const fmt = new Intl.DateTimeFormat(undefined, { timeZone: zone, weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
    const dayDiff = Math.round((Date.UTC(...(ymdIn(instant, zone) as [number, number, number])) - Date.UTC(y, mo - 1, d)) / 86_400_000);
    return { text: fmt.format(new Date(instant)), offset: formatOffset(zoneOffset(instant, zone)), dayDiff };
  };

  const zoneOptions = zones.map((z) => <option key={z} value={z} />);
  return (
    <div className="space-y-4">
      <Card className="grid gap-3 p-4 sm:grid-cols-[1fr_1fr_1.4fr]">
        <div>
          <label htmlFor="tz-date" className="label">
            Date
          </label>
          <input id="tz-date" type="date" className="input" value={date} onChange={(e) => setDate(e.target.value)} />
        </div>
        <div>
          <label htmlFor="tz-time" className="label">
            Time
          </label>
          <input id="tz-time" type="time" className="input" value={time} onChange={(e) => setTime(e.target.value)} />
        </div>
        <div>
          <label htmlFor="tz-from" className="label">
            In time zone
          </label>
          <input id="tz-from" className={`input ${isZone(from) ? '' : 'border-error'}`} list="tz-list" value={from} onChange={(e) => setFrom(e.target.value)} />
        </div>
        <datalist id="tz-list">{zoneOptions}</datalist>
        {valid && <p className="text-xs text-muted sm:col-span-3">{from} is {formatOffset(zoneOffset(instant, from))} on this date. Daylight-saving changes are applied automatically.</p>}
      </Card>

      {valid ? (
        <Card className="divide-y divide-line">
          {targets.filter((z) => canonical(z) !== canonical(from)).map((z) => {
            const s = show(z);
            return (
              <div key={z} className="flex flex-wrap items-center justify-between gap-2 px-4 py-2.5">
                <div className="min-w-0">
                  <p className="text-sm font-medium">{z.replace(/_/g, ' ')}</p>
                  <p className="text-xs text-muted">{s.offset}</p>
                </div>
                <div className="flex items-center gap-3">
                  <span className="font-semibold tabular-nums">
                    {s.text}
                    {s.dayDiff !== 0 && <span className="ml-1 text-xs font-normal text-warning">{s.dayDiff > 0 ? '+1 day' : '−1 day'}</span>}
                  </span>
                  <Button size="icon" variant="ghost" aria-label={`Make ${z} the source`} title="Use as source" onClick={() => (setTargets([from, ...targets.filter((t) => t !== z)]), setFrom(z))}>
                    <ArrowLeftRight size={15} />
                  </Button>
                  <Button size="icon" variant="ghost" aria-label={`Remove ${z}`} onClick={() => setTargets(targets.filter((t) => t !== z))}>
                    <Trash2 size={15} />
                  </Button>
                </div>
              </div>
            );
          })}
          <form
            className="flex flex-wrap items-end gap-2 px-4 py-3"
            onSubmit={(e) => {
              e.preventDefault();
              if (isZone(adding) && !targets.includes(adding) && adding !== from) setTargets([...targets, adding]);
              setAdding('');
            }}
          >
            <div className="min-w-[220px] flex-1">
              <label htmlFor="tz-add" className="label">
                Add a city or zone
              </label>
              <input id="tz-add" className="input" list="tz-list" placeholder="e.g. Europe/Paris" value={adding} onChange={(e) => setAdding(e.target.value)} />
            </div>
            <Button type="submit" icon={<Plus size={14} />} disabled={!isZone(adding)}>
              Add
            </Button>
          </form>
        </Card>
      ) : (
        <p className="text-sm text-error">Choose a valid date, time and time zone (for example Asia/Kolkata).</p>
      )}
    </div>
  );
}

function ymdIn(instant: number, zone: string): [number, number, number] {
  const p = new Intl.DateTimeFormat('en-US', { timeZone: zone, year: 'numeric', month: 'numeric', day: 'numeric' }).formatToParts(new Date(instant));
  const g = (t: string) => Number(p.find((x) => x.type === t)!.value);
  return [g('year'), g('month') - 1, g('day')];
}
