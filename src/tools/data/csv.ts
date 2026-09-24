/** RFC 4180-style CSV parsing and writing. */

export type Delimiter = ',' | ';' | '\t' | '|';

/** Guess the delimiter by consistency of field counts over the first lines (quotes respected). */
export function detectDelimiter(text: string): Delimiter {
  const sample = text.slice(0, 20000);
  const candidates: Delimiter[] = [',', ';', '\t', '|'];
  let best: Delimiter = ',';
  let bestScore = -1;
  for (const d of candidates) {
    const rows = parseCsv(sample, d).slice(0, 20);
    if (rows.length === 0) continue;
    const counts = rows.map((r) => r.length);
    const first = counts[0];
    if (first < 2) continue;
    const consistent = counts.filter((c) => c === first).length / counts.length;
    const score = consistent * 100 + first;
    if (score > bestScore) {
      bestScore = score;
      best = d;
    }
  }
  return best;
}

export function parseCsv(input: string, delimiter: Delimiter = ','): string[][] {
  const text = input.charCodeAt(0) === 0xfeff ? input.slice(1) : input;
  const rows: string[][] = [];
  let row: string[] = [];
  let field = '';
  let inQuotes = false;
  let i = 0;
  while (i < text.length) {
    const c = text[i];
    if (inQuotes) {
      if (c === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i += 2;
          continue;
        }
        inQuotes = false;
        i++;
        continue;
      }
      field += c;
      i++;
      continue;
    }
    if (c === '"' && field === '') {
      inQuotes = true;
      i++;
    } else if (c === delimiter) {
      row.push(field);
      field = '';
      i++;
    } else if (c === '\n' || c === '\r') {
      row.push(field);
      rows.push(row);
      row = [];
      field = '';
      i += c === '\r' && text[i + 1] === '\n' ? 2 : 1;
    } else {
      field += c;
      i++;
    }
  }
  if (field !== '' || row.length > 0) {
    row.push(field);
    rows.push(row);
  }
  // Drop fully empty trailing lines.
  while (rows.length && rows[rows.length - 1].every((f) => f === '')) rows.pop();
  return rows;
}

export interface CsvToJsonOptions {
  delimiter?: Delimiter;
  header: boolean;
  inferTypes: boolean;
  skipEmpty: boolean;
}

function infer(v: string): unknown {
  if (v === '') return '';
  if (v === 'true') return true;
  if (v === 'false') return false;
  if (v === 'null') return null;
  // Only convert canonical numbers; keep things like "007" or "1e5" phone/ID-like strings as text.
  if (/^-?(0|[1-9]\d{0,14})(\.\d+)?$/.test(v)) return Number(v);
  return v;
}

export function csvToJson(text: string, o: CsvToJsonOptions): { data: unknown[]; delimiter: Delimiter; columns: number; warnings: string[] } {
  const delimiter = o.delimiter ?? detectDelimiter(text);
  let rows = parseCsv(text, delimiter);
  if (o.skipEmpty) rows = rows.filter((r) => r.some((f) => f.trim() !== ''));
  const warnings: string[] = [];
  const conv = (v: string) => (o.inferTypes ? infer(v) : v);
  if (!o.header) return { data: rows.map((r) => r.map(conv)), delimiter, columns: Math.max(0, ...rows.map((r) => r.length)), warnings };

  const [head = [], ...body] = rows;
  // Make header names unique and non-empty.
  const seen = new Map<string, number>();
  const keys = head.map((h, i) => {
    const base = h.trim() || `column_${i + 1}`;
    const n = seen.get(base) ?? 0;
    seen.set(base, n + 1);
    return n ? `${base}_${n + 1}` : base;
  });
  let ragged = 0;
  const data = body.map((r) => {
    if (r.length !== keys.length) ragged++;
    const obj: Record<string, unknown> = {};
    keys.forEach((k, i) => (obj[k] = conv(r[i] ?? '')));
    for (let i = keys.length; i < r.length; i++) obj[`column_${i + 1}`] = conv(r[i]);
    return obj;
  });
  if (ragged) warnings.push(`${ragged} row${ragged > 1 ? 's have' : ' has'} a different number of fields than the header.`);
  return { data, delimiter, columns: keys.length, warnings };
}

function escapeField(v: unknown, delimiter: string): string {
  const s = v == null ? '' : typeof v === 'object' ? JSON.stringify(v) : String(v);
  return /["\r\n]/.test(s) || s.includes(delimiter) || /^\s|\s$/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export function jsonToCsv(input: unknown, delimiter: Delimiter = ','): { csv: string; rows: number; columns: string[] } {
  let arr: unknown[];
  if (Array.isArray(input)) arr = input;
  else if (input && typeof input === 'object') {
    // Accept {"items": [...]} style wrappers with a single array property.
    const arrays = Object.values(input).filter(Array.isArray);
    arr = arrays.length === 1 ? (arrays[0] as unknown[]) : [input];
  } else throw new Error('JSON must be an array of objects (or an object).');

  if (arr.every((x) => Array.isArray(x))) {
    const csv = (arr as unknown[][]).map((r) => r.map((v) => escapeField(v, delimiter)).join(delimiter)).join('\r\n');
    return { csv, rows: arr.length, columns: [] };
  }
  const columns: string[] = [];
  const seen = new Set<string>();
  for (const item of arr) {
    if (item && typeof item === 'object' && !Array.isArray(item)) {
      for (const k of Object.keys(item)) if (!seen.has(k)) (seen.add(k), columns.push(k));
    }
  }
  if (columns.length === 0) {
    const csv = ['value', ...arr.map((v) => escapeField(v, delimiter))].join('\r\n');
    return { csv, rows: arr.length, columns: ['value'] };
  }
  const lines = [columns.map((c) => escapeField(c, delimiter)).join(delimiter)];
  for (const item of arr) {
    const obj = (item && typeof item === 'object' ? item : {}) as Record<string, unknown>;
    lines.push(columns.map((c) => escapeField(obj[c], delimiter)).join(delimiter));
  }
  return { csv: lines.join('\r\n'), rows: arr.length, columns };
}

/** Write a header and rows as CSV (RFC 4180 quoting, CRLF line endings). */
export function rowsToCsv(header: string[], rows: string[][], delimiter: Delimiter = ','): string {
  return [header, ...rows].map((r) => r.map((v) => escapeField(v, delimiter)).join(delimiter)).join('\r\n');
}
