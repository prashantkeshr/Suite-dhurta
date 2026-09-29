/** Time formatting and Pomodoro sequencing (pure, unit-tested). */

export type PomodoroPhase = 'focus' | 'short' | 'long';

const pad = (n: number, w = 2) => String(n).padStart(w, '0');

/**
 * Format milliseconds as a clock.
 *  - 'ms'  → mm:ss.cc (hours prefixed when needed)
 *  - 's'   → [h:]mm:ss, rounded up so a countdown never shows 00:00 early
 *  - 'hms' → h:mm:ss
 */
export function formatClock(ms: number, style: 'ms' | 's' | 'hms' = 'ms'): string {
  const t = Math.max(0, ms);
  if (style === 's' || style === 'hms') {
    const total = style === 's' ? Math.ceil(t / 1000) : Math.floor(t / 1000);
    const h = Math.floor(total / 3600);
    const m = Math.floor((total % 3600) / 60);
    const s = total % 60;
    return h || style === 'hms' ? `${h}:${pad(m)}:${pad(s)}` : `${pad(m)}:${pad(s)}`;
  }
  const h = Math.floor(t / 3_600_000);
  const m = Math.floor((t % 3_600_000) / 60_000);
  const s = Math.floor((t % 60_000) / 1000);
  const cs = Math.floor((t % 1000) / 10);
  return `${h ? `${h}:` : ''}${pad(m)}:${pad(s)}.${pad(cs)}`;
}

/** After a focus session: a long break every `every` sessions, else a short one. After a break: focus. */
export function nextPomodoroPhase(current: PomodoroPhase, completedFocus: number, every: number): PomodoroPhase {
  if (current !== 'focus') return 'focus';
  return completedFocus > 0 && completedFocus % every === 0 ? 'long' : 'short';
}
