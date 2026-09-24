/** Pure table operations for the CSV editor. A table is a header row plus string rows. */

export interface Table {
  header: string[];
  rows: string[][];
}

const collator = new Intl.Collator(undefined, { numeric: true, sensitivity: 'base' });

/** Build a table from parsed CSV rows. Without a header row, columns are named Column 1…n. */
export function fromRows(rows: string[][], hasHeader: boolean): Table {
  const width = Math.max(0, ...rows.map((r) => r.length));
  const pad = (r: string[]) => (r.length < width ? [...r, ...Array(width - r.length).fill('')] : r);
  if (hasHeader && rows.length) {
    const header = pad(rows[0]).map((h, i) => h.trim() || `Column ${i + 1}`);
    return { header, rows: rows.slice(1).map(pad) };
  }
  return { header: Array.from({ length: width }, (_, i) => `Column ${i + 1}`), rows: rows.map(pad) };
}

const isNum = (s: string) => /^\s*-?(\d+(\.\d*)?|\.\d+)(e[+-]?\d+)?\s*$/i.test(s.replace(/,/g, ''));

/** Sort rows by a column. Numbers sort numerically; empty cells always go last. */
export function sortRows(rows: string[][], col: number, dir: 'asc' | 'desc'): string[][] {
  const sign = dir === 'asc' ? 1 : -1;
  return [...rows].sort((a, b) => {
    const x = a[col] ?? '';
    const y = b[col] ?? '';
    if (x === '' || y === '') return x === y ? 0 : x === '' ? 1 : -1;
    if (isNum(x) && isNum(y)) return sign * (Number(x.replace(/,/g, '')) - Number(y.replace(/,/g, '')));
    return sign * collator.compare(x, y);
  });
}

/** Indices of rows containing `query` in any cell (case-insensitive). */
export function filterRows(rows: string[][], query: string): number[] {
  const q = query.trim().toLocaleLowerCase();
  const out: number[] = [];
  rows.forEach((r, i) => {
    if (!q || r.some((c) => c.toLocaleLowerCase().includes(q))) out.push(i);
  });
  return out;
}

export function removeDuplicateRows(rows: string[][], opts: { ignoreCase?: boolean; trim?: boolean; columns?: number[] } = {}): { rows: string[][]; removed: number } {
  const seen = new Set<string>();
  const kept = rows.filter((r) => {
    const cells = opts.columns ? opts.columns.map((c) => r[c] ?? '') : r;
    let key = cells.map((c) => (opts.trim ? c.trim() : c)).join('\u0001');
    if (opts.ignoreCase) key = key.toLocaleLowerCase();
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
  return { rows: kept, removed: rows.length - kept.length };
}

export function removeEmptyRows(rows: string[][]): { rows: string[][]; removed: number } {
  const kept = rows.filter((r) => r.some((c) => c.trim() !== ''));
  return { rows: kept, removed: rows.length - kept.length };
}

export function trimCells(t: Table): Table {
  return { header: t.header.map((h) => h.trim()), rows: t.rows.map((r) => r.map((c) => c.trim().replace(/\s+/g, ' '))) };
}

/** Split one column into several at a separator (e.g. "Asha Rao" → "Asha", "Rao"). */
export function splitColumn(t: Table, col: number, separator: string, maxParts = 0): Table {
  if (!separator) return t;
  const parts = t.rows.map((r) => {
    const v = r[col] ?? '';
    const pieces = v.split(separator);
    if (maxParts > 1 && pieces.length > maxParts) return [...pieces.slice(0, maxParts - 1), pieces.slice(maxParts - 1).join(separator)];
    return pieces;
  });
  const n = Math.max(1, ...parts.map((p) => p.length));
  const names = Array.from({ length: n }, (_, i) => `${t.header[col]} ${i + 1}`);
  return {
    header: [...t.header.slice(0, col), ...names, ...t.header.slice(col + 1)],
    rows: t.rows.map((r, i) => [...r.slice(0, col), ...Array.from({ length: n }, (_, k) => (parts[i][k] ?? '').trim()), ...r.slice(col + 1)]),
  };
}

/** Merge columns into one, joined in the given order and placed at the leftmost merged column. */
export function mergeColumns(t: Table, cols: number[], separator: string, name?: string): Table {
  const picked = [...new Set(cols)];
  if (picked.length < 2) return t;
  const at = Math.min(...picked);
  const drop = new Set(picked.filter((c) => c !== at));
  const keep = (arr: string[]) => arr.filter((_, i) => !drop.has(i));
  const header = keep(t.header.map((h, i) => (i === at ? name || picked.map((c) => t.header[c]).join(' + ') : h)));
  const rows = t.rows.map((r) => {
    const merged = picked
      .map((c) => r[c] ?? '')
      .filter((v) => v !== '')
      .join(separator);
    return keep(r.map((v, i) => (i === at ? merged : v)));
  });
  return { header, rows };
}

export function deleteColumn(t: Table, col: number): Table {
  return { header: t.header.filter((_, i) => i !== col), rows: t.rows.map((r) => r.filter((_, i) => i !== col)) };
}

export function renameColumn(t: Table, col: number, name: string): Table {
  return { ...t, header: t.header.map((h, i) => (i === col ? name : h)) };
}

/** Change letter case of a column, or all columns when `col` is null. */
export function caseColumn(t: Table, col: number | null, mode: 'upper' | 'lower' | 'title'): Table {
  const f = (s: string) => (mode === 'upper' ? s.toLocaleUpperCase() : mode === 'lower' ? s.toLocaleLowerCase() : s.toLocaleLowerCase().replace(/(^|[\s\-'’(])(\p{L})/gu, (_, p: string, c: string) => p + c.toLocaleUpperCase()));
  return { ...t, rows: t.rows.map((r) => r.map((v, i) => (col === null || i === col ? f(v) : v))) };
}

/** Column statistics for the header tooltip. */
export function columnStats(rows: string[][], col: number) {
  const values = rows.map((r) => r[col] ?? '');
  const filled = values.filter((v) => v.trim() !== '');
  const nums = filled.filter(isNum).map((v) => Number(v.replace(/,/g, '')));
  const numeric = filled.length > 0 && nums.length === filled.length;
  return {
    filled: filled.length,
    empty: values.length - filled.length,
    unique: new Set(filled).size,
    numeric,
    min: numeric ? Math.min(...nums) : undefined,
    max: numeric ? Math.max(...nums) : undefined,
    sum: numeric ? nums.reduce((a, b) => a + b, 0) : undefined,
  };
}

export function tableToObjects(t: Table): Record<string, string>[] {
  return t.rows.map((r) => Object.fromEntries(t.header.map((h, i) => [h, r[i] ?? ''])));
}
