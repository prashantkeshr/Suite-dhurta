/**
 * Parse a human page-range string into zero-based page indices.
 * Accepts "1-3, 5, 8-" (open end), "-4" (open start), "all", and ignores
 * spaces. Throws a descriptive Error for anything invalid.
 */
export function parsePageRanges(input: string, pageCount: number): number[] {
  const text = input.trim().toLowerCase();
  if (!text || text === 'all') return Array.from({ length: pageCount }, (_, i) => i);
  const out: number[] = [];
  const seen = new Set<number>();
  for (const rawPart of text.split(/[,;]+/)) {
    const part = rawPart.replace(/\s+/g, '');
    if (!part) continue;
    const m = part.match(/^(\d*)(?:(-|–|to)(\d*))?$/);
    if (!m || (!m[1] && !m[3])) throw new Error(`“${rawPart.trim()}” is not a valid page or range.`);
    const start = m[1] ? Number(m[1]) : 1;
    const end = m[2] ? (m[3] ? Number(m[3]) : pageCount) : start;
    if (start < 1 || end < 1) throw new Error('Page numbers start at 1.');
    if (start > pageCount || end > pageCount) throw new Error(`This document has ${pageCount} page${pageCount === 1 ? '' : 's'}; “${rawPart.trim()}” is out of range.`);
    const step = start <= end ? 1 : -1;
    for (let p = start; step > 0 ? p <= end : p >= end; p += step) {
      if (!seen.has(p - 1)) {
        seen.add(p - 1);
        out.push(p - 1);
      }
    }
  }
  if (out.length === 0) throw new Error('No pages selected.');
  return out;
}

/** Compact display of zero-based indices: [0,1,2,4] → "1–3, 5". */
export function formatPageList(indices: number[]): string {
  const sorted = [...new Set(indices)].sort((a, b) => a - b);
  const parts: string[] = [];
  for (let i = 0; i < sorted.length; i++) {
    const start = sorted[i];
    let end = start;
    while (i + 1 < sorted.length && sorted[i + 1] === end + 1) end = sorted[++i];
    parts.push(start === end ? `${start + 1}` : `${start + 1}–${end + 1}`);
  }
  return parts.join(', ');
}

/** Split [0..n) into consecutive chunks of `size` pages. */
export function chunkPages(pageCount: number, size: number): number[][] {
  const s = Math.max(1, Math.floor(size));
  const out: number[][] = [];
  for (let i = 0; i < pageCount; i += s) out.push(Array.from({ length: Math.min(s, pageCount - i) }, (_, j) => i + j));
  return out;
}
