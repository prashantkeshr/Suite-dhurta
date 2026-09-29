/**
 * Calendar maths on plain dates ("YYYY-MM-DD"), done in UTC so daylight-saving
 * changes can never add or lose a day.
 */

export interface Ymd {
  y: number;
  m: number; // 1–12
  d: number;
}

const DAY = 86_400_000;

export function parseDate(s: string): Ymd | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s);
  if (!m) return null;
  const v = { y: +m[1], m: +m[2], d: +m[3] };
  const t = new Date(Date.UTC(v.y, v.m - 1, v.d));
  return t.getUTCFullYear() === v.y && t.getUTCMonth() === v.m - 1 && t.getUTCDate() === v.d ? v : null;
}

export const toUtc = (v: Ymd) => Date.UTC(v.y, v.m - 1, v.d);
export const fromUtc = (t: number): Ymd => {
  const d = new Date(t);
  return { y: d.getUTCFullYear(), m: d.getUTCMonth() + 1, d: d.getUTCDate() };
};
export const formatYmd = (v: Ymd) => `${v.y}-${String(v.m).padStart(2, '0')}-${String(v.d).padStart(2, '0')}`;
export const daysInMonth = (y: number, m: number) => new Date(Date.UTC(y, m, 0)).getUTCDate();
export const isLeap = (y: number) => (y % 4 === 0 && y % 100 !== 0) || y % 400 === 0;
export const todayYmd = (): Ymd => {
  const n = new Date();
  return { y: n.getFullYear(), m: n.getMonth() + 1, d: n.getDate() };
};

/** Whole days from a to b (negative when b is earlier). */
export const daysBetween = (a: Ymd, b: Ymd) => Math.round((toUtc(b) - toUtc(a)) / DAY);

/**
 * Calendar difference in years, months and days (a ≤ b): the most whole
 * months that fit (month-end clamped, so 31 Jan + 1 month = 28 Feb), then the
 * remaining days. 31 Jan → 1 Mar is 1 month 1 day.
 */
export function ymdDiff(a: Ymd, b: Ymd): { years: number; months: number; days: number } {
  let months = (b.y - a.y) * 12 + (b.m - a.m);
  if (months > 0 && toUtc(addToDate(a, { months })) > toUtc(b)) months--;
  const days = daysBetween(addToDate(a, { months }), b);
  return { years: Math.floor(months / 12), months: months % 12, days };
}

/** Add years/months (clamped to month end: 31 Jan + 1 month = 28/29 Feb), then weeks/days. */
export function addToDate(v: Ymd, add: { years?: number; months?: number; weeks?: number; days?: number }): Ymd {
  const totalMonths = v.y * 12 + (v.m - 1) + (add.years ?? 0) * 12 + (add.months ?? 0);
  const y = Math.floor(totalMonths / 12);
  const m = (totalMonths % 12) + 1;
  const d = Math.min(v.d, daysInMonth(y, m));
  return fromUtc(toUtc({ y, m, d }) + ((add.weeks ?? 0) * 7 + (add.days ?? 0)) * DAY);
}

/** Monday–Friday days in [a, b] (or [a, b) when includeEnd is false). */
export function workingDays(a: Ymd, b: Ymd, includeEnd = true): number {
  let start = toUtc(a);
  let end = toUtc(b);
  if (end < start) [start, end] = [end, start];
  if (!includeEnd) end -= DAY;
  const total = Math.round((end - start) / DAY) + 1;
  if (total <= 0) return 0;
  const weeks = Math.floor(total / 7);
  let count = weeks * 5;
  const startDow = new Date(start).getUTCDay();
  for (let i = 0; i < total % 7; i++) {
    const dow = (startDow + weeks * 7 + i) % 7;
    if (dow !== 0 && dow !== 6) count++;
  }
  return count;
}

export interface AgeResult {
  years: number;
  months: number;
  days: number;
  totalDays: number;
  totalWeeks: number;
  totalMonths: number;
  nextBirthday: Ymd;
  daysToBirthday: number;
  bornOn: string;
}

const WEEKDAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
export const weekday = (v: Ymd) => WEEKDAYS[new Date(toUtc(v)).getUTCDay()];

/** Age on a given date. 29 Feb birthdays fall on 28 Feb in common years. */
export function age(birth: Ymd, on: Ymd): AgeResult | null {
  if (toUtc(on) < toUtc(birth)) return null;
  const diff = ymdDiff(birth, on);
  const bdayIn = (y: number): Ymd => ({ y, m: birth.m, d: Math.min(birth.d, daysInMonth(y, birth.m)) });
  let next = bdayIn(on.y);
  if (toUtc(next) < toUtc(on)) next = bdayIn(on.y + 1);
  const totalDays = daysBetween(birth, on);
  return {
    ...diff,
    totalDays,
    totalWeeks: Math.floor(totalDays / 7),
    totalMonths: diff.years * 12 + diff.months,
    nextBirthday: next,
    daysToBirthday: daysBetween(on, next),
    bornOn: weekday(birth),
  };
}
