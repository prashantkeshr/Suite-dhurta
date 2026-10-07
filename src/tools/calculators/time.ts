/** Durations, clock times and time zones (pure, unit-tested). Durations are whole seconds. */

const DAY = 86_400;

/**
 * Parse a duration the way people type it: "1:30", "1:30:15", "1h 30m",
 * "90m", "1.5h", "2 hours 5 min", "45" (minutes). Returns seconds, or NaN.
 */
export function parseDuration(input: string): number {
  const s = input.trim().toLowerCase().replace(',', '.');
  if (!s) return NaN;
  const neg = s.startsWith('-');
  const body = neg ? s.slice(1).trim() : s;
  let secs = NaN;
  if (/^\d+(\.\d+)?$/.test(body)) secs = Number(body) * 60; // bare number = minutes
  else if (/^\d+:\d{1,2}(:\d{1,2}(\.\d+)?)?$/.test(body)) {
    const [h, m, sec = '0'] = body.split(':');
    if (Number(m) < 60 && Number(sec) < 60) secs = Number(h) * 3600 + Number(m) * 60 + Number(sec);
  } else {
    const re = /(\d+(?:\.\d+)?)\s*(d|days?|h|hrs?|hours?|m|mins?|minutes?|s|secs?|seconds?)\b/g;
    let total = 0;
    let used = '';
    for (const m of body.matchAll(re)) {
      const v = Number(m[1]);
      const u = m[2][0];
      total += v * (u === 'd' ? DAY : u === 'h' ? 3600 : u === 'm' ? 60 : 1);
      used += m[0];
    }
    if (used && body.replace(/\s+/g, '').length === used.replace(/\s+/g, '').length) secs = total;
  }
  return Number.isFinite(secs) ? Math.round(neg ? -secs : secs) : NaN;
}

/** 5415 → "1:30:15"; negative durations keep their sign; days become hours (26:00:00). */
export function formatHms(total: number): string {
  const sign = total < 0 ? '−' : '';
  const t = Math.abs(Math.round(total));
  const h = Math.floor(t / 3600);
  const m = Math.floor((t % 3600) / 60);
  const s = t % 60;
  return `${sign}${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

/** 5415 → "1 h 30 min 15 s". */
export function formatWords(total: number): string {
  const sign = total < 0 ? '−' : '';
  let t = Math.abs(Math.round(total));
  const d = Math.floor(t / DAY);
  t %= DAY;
  const parts = [d && `${d} d`, Math.floor(t / 3600) && `${Math.floor(t / 3600)} h`, Math.floor((t % 3600) / 60) && `${Math.floor((t % 3600) / 60)} min`, t % 60 && `${t % 60} s`].filter(Boolean);
  return sign + (parts.join(' ') || '0 min');
}

/** Clock time "09:30", "9:30 pm", "21:30:15", "930" → seconds after midnight, or NaN. */
export function parseClock(input: string): number {
  const s = input.trim().toLowerCase().replace(/\./g, '');
  const m = /^(\d{1,2})(?::?(\d{2}))?(?::(\d{2}))?\s*(am|pm|a|p)?$/.exec(s);
  if (!m) return NaN;
  let h = Number(m[1]);
  const min = Number(m[2] ?? 0);
  const sec = Number(m[3] ?? 0);
  const ampm = m[4]?.[0];
  if (min > 59 || sec > 59) return NaN;
  if (ampm) {
    if (h < 1 || h > 12) return NaN;
    h = (h % 12) + (ampm === 'p' ? 12 : 0);
  } else if (h > 24 || (h === 24 && (min || sec))) return NaN;
  return (h % 24) * 3600 + min * 60 + sec;
}

/** Seconds after midnight → "21:30" / "9:30 PM" (drops :00 seconds). */
export function formatClock(secs: number, h12 = false): string {
  const t = ((Math.round(secs) % DAY) + DAY) % DAY;
  const h = Math.floor(t / 3600);
  const m = String(Math.floor((t % 3600) / 60)).padStart(2, '0');
  const s = t % 60 ? `:${String(t % 60).padStart(2, '0')}` : '';
  if (!h12) return `${String(h).padStart(2, '0')}:${m}${s}`;
  return `${h % 12 || 12}:${m}${s} ${h < 12 ? 'AM' : 'PM'}`;
}

/** Time worked between two clock times; an end before the start means the shift crossed midnight. */
export function timeBetween(start: number, end: number, breakSecs = 0): { secs: number; overnight: boolean } {
  const overnight = end < start;
  const span = (overnight ? end + DAY : end) - start;
  return { secs: Math.max(0, span - breakSecs), overnight };
}

/** Clock time + duration → new clock time and how many days later (or earlier). */
export function addToClock(clock: number, duration: number): { clock: number; dayOffset: number } {
  const total = clock + duration;
  return { clock: ((total % DAY) + DAY) % DAY, dayOffset: Math.floor(total / DAY) };
}

/* ---------- Time zones (via Intl, so daylight saving is always current) ---------- */

/** Offset of a zone from UTC, in minutes, at a given instant. */
export function zoneOffset(instant: number, timeZone: string): number {
  const parts = new Intl.DateTimeFormat('en-US', { timeZone, hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit' }).formatToParts(new Date(instant));
  const get = (t: string) => Number(parts.find((p) => p.type === t)!.value);
  const asUtc = Date.UTC(get('year'), get('month') - 1, get('day'), get('hour'), get('minute'), get('second'));
  return Math.round((asUtc - Math.floor(instant / 1000) * 1000) / 60000);
}

/** Wall-clock time in a zone → UTC instant (ms). Handles DST by re-checking the offset. */
export function zonedToInstant(y: number, mo: number, d: number, h: number, mi: number, timeZone: string): number {
  const guess = Date.UTC(y, mo - 1, d, h, mi);
  let instant = guess - zoneOffset(guess, timeZone) * 60000;
  const second = guess - zoneOffset(instant, timeZone) * 60000;
  if (second !== instant) instant = second;
  return instant;
}

export function formatOffset(minutes: number): string {
  const sign = minutes < 0 ? '−' : '+';
  const a = Math.abs(minutes);
  return `UTC${sign}${Math.floor(a / 60)}${a % 60 ? `:${String(a % 60).padStart(2, '0')}` : ''}`;
}
