export function formatBytes(bytes: number, digits = 1): string {
  if (!Number.isFinite(bytes) || bytes < 0) return '—';
  if (bytes < 1024) return `${bytes} B`;
  const units = ['KB', 'MB', 'GB', 'TB'];
  let v = bytes / 1024;
  let i = 0;
  while (v >= 1024 && i < units.length - 1) {
    v /= 1024;
    i++;
  }
  return `${v.toFixed(v >= 100 ? 0 : digits)} ${units[i]}`;
}

export function formatNumber(n: number, maxFraction = 6): string {
  if (!Number.isFinite(n)) return '—';
  return n.toLocaleString(undefined, { maximumFractionDigits: maxFraction });
}

export function percentChange(before: number, after: number): string {
  if (before === 0) return '—';
  const p = ((after - before) / before) * 100;
  return `${p > 0 ? '+' : ''}${p.toFixed(1)}%`;
}

export function gcd(a: number, b: number): number {
  return b === 0 ? a : gcd(b, a % b);
}

export function aspectRatio(w: number, h: number): string {
  if (!w || !h) return '—';
  const g = gcd(w, h);
  return `${w / g}:${h / g}`;
}
