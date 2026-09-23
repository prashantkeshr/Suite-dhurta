/** Pure developer-tool logic. */

/* ---------- JSON ---------- */

export interface JsonError {
  message: string;
  line?: number;
  column?: number;
}

/**
 * Offset of the first JSON syntax error, found with a small scanner. Browser
 * error messages differ and newer engines omit the position, so we don't rely
 * on them. Returns -1 when the text is valid.
 */
export function findJsonErrorOffset(text: string): number {
  let i = 0;
  const ws = () => {
    while (i < text.length && ' \t\n\r'.includes(text[i])) i++;
  };
  const fail = (): never => {
    throw i;
  };
  const literal = (word: string) => {
    if (text.startsWith(word, i)) i += word.length;
    else fail();
  };
  const string = () => {
    i++; // opening quote
    while (i < text.length) {
      const c = text[i];
      if (c === '"') return void i++;
      if (c === '\\') {
        const n = text[i + 1];
        if (n === 'u') {
          if (!/^[0-9a-fA-F]{4}$/.test(text.slice(i + 2, i + 6))) (i += 1), fail();
          i += 6;
        } else if (n !== undefined && '"\\/bfnrt'.includes(n)) i += 2;
        else (i += 1), fail();
      } else if (c < ' ') fail();
      else i++;
    }
    fail();
  };
  const number = () => {
    const m = /^-?(0|[1-9]\d*)(\.\d+)?([eE][+-]?\d+)?/.exec(text.slice(i));
    if (!m) fail();
    i += m![0].length;
  };
  const value = (): void => {
    ws();
    const c = text[i];
    if (c === '{') {
      i++;
      ws();
      if (text[i] === '}') return void i++;
      for (;;) {
        ws();
        if (text[i] !== '"') fail();
        string();
        ws();
        if (text[i] !== ':') fail();
        i++;
        value();
        ws();
        if (text[i] === ',') i++;
        else if (text[i] === '}') return void i++;
        else fail();
      }
    } else if (c === '[') {
      i++;
      ws();
      if (text[i] === ']') return void i++;
      for (;;) {
        value();
        ws();
        if (text[i] === ',') i++;
        else if (text[i] === ']') return void i++;
        else fail();
      }
    } else if (c === '"') string();
    else if (c === 't') literal('true');
    else if (c === 'f') literal('false');
    else if (c === 'n') literal('null');
    else if (c === '-' || (c >= '0' && c <= '9')) number();
    else fail();
  };
  try {
    value();
    ws();
    if (i < text.length) fail();
    return -1;
  } catch (pos) {
    return typeof pos === 'number' ? Math.min(pos, text.length) : -1;
  }
}

/** Turn a JSON.parse error into a line/column. */
export function locateJsonError(text: string, err: unknown): JsonError {
  const message = err instanceof Error ? err.message : String(err);
  const offset = findJsonErrorOffset(text);
  if (offset < 0) return { message };
  const before = text.slice(0, offset);
  return { message, line: before.split('\n').length, column: offset - before.lastIndexOf('\n') };
}

export function formatJson(text: string, indent: number | '\t' | 0, sortKeys = false): { output: string; error?: JsonError } {
  if (!text.trim()) return { output: '' };
  try {
    let value = JSON.parse(text);
    if (sortKeys) value = sortDeep(value);
    return { output: indent === 0 ? JSON.stringify(value) : JSON.stringify(value, null, indent) };
  } catch (err) {
    return { output: '', error: locateJsonError(text, err) };
  }
}

function sortDeep(v: unknown): unknown {
  if (Array.isArray(v)) return v.map(sortDeep);
  if (v && typeof v === 'object') {
    return Object.fromEntries(
      Object.keys(v as object)
        .sort()
        .map((k) => [k, sortDeep((v as Record<string, unknown>)[k])]),
    );
  }
  return v;
}

export function jsonStats(value: unknown): { keys: number; depth: number; arrays: number; objects: number } {
  let keys = 0,
    arrays = 0,
    objects = 0,
    depth = 0;
  const walk = (x: unknown, d: number) => {
    depth = Math.max(depth, d);
    if (Array.isArray(x)) {
      arrays++;
      x.forEach((y) => walk(y, d + 1));
    } else if (x && typeof x === 'object') {
      objects++;
      for (const [, y] of Object.entries(x)) {
        keys++;
        walk(y, d + 1);
      }
    }
  };
  walk(value, 0);
  return { keys, depth, arrays, objects };
}

/* ---------- Base64 (UTF-8 safe) ---------- */

export function base64Encode(text: string, urlSafe = false): string {
  const bytes = new TextEncoder().encode(text);
  let bin = '';
  for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  const b64 = btoa(bin);
  return urlSafe ? b64.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '') : b64;
}

export function base64Decode(input: string): string {
  const clean = input.replace(/\s+/g, '').replace(/-/g, '+').replace(/_/g, '/');
  if (!/^[A-Za-z0-9+/]*={0,2}$/.test(clean)) throw new Error('The input contains characters that are not valid Base64.');
  const padded = clean.padEnd(Math.ceil(clean.length / 4) * 4, '=');
  const bin = atob(padded);
  const bytes = Uint8Array.from(bin, (c) => c.charCodeAt(0));
  try {
    return new TextDecoder('utf-8', { fatal: true }).decode(bytes);
  } catch {
    throw new Error('The decoded data is binary, not UTF-8 text. If it is an image, use Base64 to Image.');
  }
}

/* ---------- URL encoding ---------- */

export function urlEncode(text: string, mode: 'component' | 'uri'): string {
  return mode === 'component' ? encodeURIComponent(text) : encodeURI(text);
}

export function urlDecode(text: string, plusAsSpace: boolean): string {
  return decodeURIComponent(plusAsSpace ? text.replace(/\+/g, ' ') : text);
}

/* ---------- HTML entities ---------- */

const NAMED: Record<string, string> = {
  amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ', copy: '©', reg: '®', trade: '™', hellip: '…', mdash: '—', ndash: '–',
  lsquo: '‘', rsquo: '’', ldquo: '“', rdquo: '”', bull: '•', middot: '·', deg: '°', plusmn: '±', times: '×', divide: '÷', euro: '€',
  pound: '£', yen: '¥', cent: '¢', sect: '§', para: '¶', laquo: '«', raquo: '»', rarr: '→', larr: '←', uarr: '↑', darr: '↓', hearts: '♥', check: '✓', inr: '₹',
};

export function encodeEntities(text: string, mode: 'minimal' | 'nonascii'): string {
  const minimal = text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  if (mode === 'minimal') return minimal;
  return Array.from(minimal)
    .map((c) => {
      const cp = c.codePointAt(0)!;
      return cp > 126 ? `&#${cp};` : c;
    })
    .join('');
}

export function decodeEntities(text: string): string {
  return text.replace(/&(#x[0-9a-f]+|#\d+|[a-z][a-z0-9]*);/gi, (m, body: string) => {
    if (body[0] === '#') {
      const cp = body[1].toLowerCase() === 'x' ? parseInt(body.slice(2), 16) : parseInt(body.slice(1), 10);
      return cp > 0 && cp <= 0x10ffff ? String.fromCodePoint(cp) : m;
    }
    return NAMED[body] ?? NAMED[body.toLowerCase()] ?? m;
  });
}

/* ---------- JWT ---------- */

export interface DecodedJwt {
  header: Record<string, unknown>;
  payload: Record<string, unknown>;
  signature: string;
}

export function decodeJwt(token: string): DecodedJwt {
  const parts = token.trim().replace(/^Bearer\s+/i, '').split('.');
  if (parts.length !== 3) throw new Error(`A JWT has 3 parts separated by dots; this has ${parts.length}.`);
  const part = (s: string, name: string) => {
    try {
      return JSON.parse(base64Decode(s));
    } catch {
      throw new Error(`The ${name} is not valid Base64URL-encoded JSON.`);
    }
  };
  return { header: part(parts[0], 'header'), payload: part(parts[1], 'payload'), signature: parts[2] };
}

/* ---------- Colors ---------- */

export interface RGB {
  r: number;
  g: number;
  b: number;
  a: number;
}

const clamp = (n: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, n));

export function parseColor(input: string): RGB | null {
  const s = input.trim().toLowerCase();
  let m = s.match(/^#?([0-9a-f]{3,4}|[0-9a-f]{6}|[0-9a-f]{8})$/);
  if (m) {
    let h = m[1];
    if (h.length <= 4) h = [...h].map((c) => c + c).join('');
    return { r: parseInt(h.slice(0, 2), 16), g: parseInt(h.slice(2, 4), 16), b: parseInt(h.slice(4, 6), 16), a: h.length === 8 ? parseInt(h.slice(6, 8), 16) / 255 : 1 };
  }
  m = s.match(/^rgba?\(\s*([\d.]+)[\s,]+([\d.]+)[\s,]+([\d.]+)(?:[\s,/]+([\d.]+%?))?\s*\)$/);
  if (m) {
    const a = m[4] ? (m[4].endsWith('%') ? parseFloat(m[4]) / 100 : parseFloat(m[4])) : 1;
    return { r: clamp(+m[1], 0, 255), g: clamp(+m[2], 0, 255), b: clamp(+m[3], 0, 255), a: clamp(a, 0, 1) };
  }
  m = s.match(/^hsla?\(\s*([\d.]+)(?:deg)?[\s,]+([\d.]+)%[\s,]+([\d.]+)%(?:[\s,/]+([\d.]+%?))?\s*\)$/);
  if (m) {
    const a = m[4] ? (m[4].endsWith('%') ? parseFloat(m[4]) / 100 : parseFloat(m[4])) : 1;
    return { ...hslToRgb(+m[1], +m[2], +m[3]), a: clamp(a, 0, 1) };
  }
  return null;
}

export function hslToRgb(h: number, s: number, l: number): { r: number; g: number; b: number } {
  s /= 100;
  l /= 100;
  const k = (n: number) => (n + h / 30) % 12;
  const a = s * Math.min(l, 1 - l);
  const f = (n: number) => l - a * Math.max(-1, Math.min(k(n) - 3, Math.min(9 - k(n), 1)));
  return { r: Math.round(f(0) * 255), g: Math.round(f(8) * 255), b: Math.round(f(4) * 255) };
}

export function rgbToHsl({ r, g, b }: RGB): { h: number; s: number; l: number } {
  const [rr, gg, bb] = [r / 255, g / 255, b / 255];
  const max = Math.max(rr, gg, bb);
  const min = Math.min(rr, gg, bb);
  const l = (max + min) / 2;
  let h = 0,
    s = 0;
  if (max !== min) {
    const d = max - min;
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    h = max === rr ? (gg - bb) / d + (gg < bb ? 6 : 0) : max === gg ? (bb - rr) / d + 2 : (rr - gg) / d + 4;
    h *= 60;
  }
  return { h: Math.round(h), s: Math.round(s * 100), l: Math.round(l * 100) };
}

export const toHex = ({ r, g, b, a }: RGB) =>
  '#' + [r, g, b].map((v) => Math.round(v).toString(16).padStart(2, '0')).join('') + (a < 1 ? Math.round(a * 255).toString(16).padStart(2, '0') : '');

function luminance({ r, g, b }: RGB) {
  const c = [r, g, b].map((v) => {
    const s = v / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];
}

/** WCAG 2.x contrast ratio between two opaque colours. */
export function contrastRatio(a: RGB, b: RGB): number {
  const [l1, l2] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (l1 + 0.05) / (l2 + 0.05);
}
