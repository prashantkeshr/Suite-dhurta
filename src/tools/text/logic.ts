/** Pure, Unicode-aware text utilities. Safe for Hindi and other scripts. */

type Granularity = 'grapheme' | 'word' | 'sentence';
interface SegmentLike {
  segment: string;
  isWordLike?: boolean;
}

function segment(text: string, granularity: Granularity): SegmentLike[] | null {
  const Seg = (Intl as unknown as { Segmenter?: new (l?: string, o?: { granularity: Granularity }) => { segment: (s: string) => Iterable<SegmentLike> } }).Segmenter;
  if (!Seg) return null;
  return Array.from(new Seg(undefined, { granularity }).segment(text));
}

export interface TextStats {
  characters: number;
  charactersNoSpaces: number;
  words: number;
  sentences: number;
  paragraphs: number;
  lines: number;
  bytes: number;
  readingMinutes: number;
  speakingMinutes: number;
}

export function countText(text: string): TextStats {
  const graphemes = segment(text, 'grapheme');
  const characters = graphemes ? graphemes.length : Array.from(text).length;
  const nonSpace = text.replace(/\s+/g, '');
  const charactersNoSpaces = segment(nonSpace, 'grapheme')?.length ?? Array.from(nonSpace).length;

  const wordSegs = segment(text, 'word');
  const words = wordSegs ? wordSegs.filter((s) => s.isWordLike).length : (text.match(/[\p{L}\p{N}\p{M}]+(?:['’][\p{L}\p{M}]+)*/gu) ?? []).length;

  const sentenceSegs = segment(text, 'sentence');
  const sentences = sentenceSegs
    ? sentenceSegs.filter((s) => /[\p{L}\p{N}]/u.test(s.segment)).length
    : text.split(/[.!?।॥]+/u).filter((s) => /[\p{L}\p{N}]/u.test(s)).length;

  const paragraphs = text.split(/\n\s*\n/).filter((p) => p.trim()).length;
  const lines = text === '' ? 0 : text.split(/\r\n|\r|\n/).length;
  const bytes = new TextEncoder().encode(text).length;
  return {
    characters,
    charactersNoSpaces,
    words,
    sentences,
    paragraphs,
    lines,
    bytes,
    readingMinutes: words / 225,
    speakingMinutes: words / 140,
  };
}

export function formatDuration(minutes: number): string {
  if (minutes <= 0) return '0 sec';
  const total = Math.max(1, Math.round(minutes * 60));
  const m = Math.floor(total / 60);
  const s = total % 60;
  if (m === 0) return `${s} sec`;
  return s ? `${m} min ${s} sec` : `${m} min`;
}

/** Top words by frequency (case-insensitive), ignoring very short words. */
export function topWords(text: string, n = 10): [string, number][] {
  const wordSegs = segment(text.toLocaleLowerCase(), 'word');
  const list = wordSegs ? wordSegs.filter((s) => s.isWordLike).map((s) => s.segment) : text.toLocaleLowerCase().match(/[\p{L}\p{N}\p{M}]+/gu) ?? [];
  const counts = new Map<string, number>();
  for (const w of list) if (Array.from(w).length > 2) counts.set(w, (counts.get(w) ?? 0) + 1);
  return [...counts.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])).slice(0, n);
}

/* ---------- Case conversion ---------- */

export type CaseMode = 'upper' | 'lower' | 'title' | 'sentence' | 'camel' | 'pascal' | 'snake' | 'kebab' | 'constant' | 'dot' | 'alternating' | 'inverse';

const SMALL_WORDS = new Set(['a', 'an', 'and', 'as', 'at', 'but', 'by', 'for', 'in', 'nor', 'of', 'on', 'or', 'the', 'to', 'up', 'via', 'vs']);

/** Split identifiers and prose into words: "helloWorld_foo-bar" → hello, World, foo, bar. */
export function splitWords(text: string): string[] {
  return text
    .replace(/([\p{Ll}\p{N}])(\p{Lu})/gu, '$1 $2')
    .replace(/(\p{Lu})(\p{Lu}\p{Ll})/gu, '$1 $2')
    .split(/[^\p{L}\p{N}\p{M}]+/u)
    .filter(Boolean);
}

const cap = (w: string) => (w ? w.charAt(0).toLocaleUpperCase() + w.slice(1).toLocaleLowerCase() : w);

export function convertCase(text: string, mode: CaseMode): string {
  switch (mode) {
    case 'upper':
      return text.toLocaleUpperCase();
    case 'lower':
      return text.toLocaleLowerCase();
    case 'title':
      return text.toLocaleLowerCase().replace(/[\p{L}\p{N}\p{M}]+(?:['’][\p{L}\p{M}]+)*/gu, (w, offset: number) => {
        const first = offset === 0 || /[.:!?]\s*$/.test(text.slice(0, offset));
        return !first && SMALL_WORDS.has(w) ? w : cap(w);
      });
    case 'sentence':
      return text.toLocaleLowerCase().replace(/(^\s*|[.!?।]\s+)(\p{L})/gu, (_, p: string, c: string) => p + c.toLocaleUpperCase());
    case 'inverse':
      return Array.from(text)
        .map((c) => (c === c.toLocaleUpperCase() ? c.toLocaleLowerCase() : c.toLocaleUpperCase()))
        .join('');
    case 'alternating': {
      let i = 0;
      return Array.from(text)
        .map((c) => (/\p{L}/u.test(c) ? (i++ % 2 ? c.toLocaleUpperCase() : c.toLocaleLowerCase()) : c))
        .join('');
    }
  }
  // Identifier styles work line by line so lists of names convert cleanly.
  return text
    .split('\n')
    .map((line) => {
      const words = splitWords(line);
      if (!words.length) return line;
      switch (mode) {
        case 'camel':
          return words.map((w, i) => (i === 0 ? w.toLocaleLowerCase() : cap(w))).join('');
        case 'pascal':
          return words.map(cap).join('');
        case 'snake':
          return words.map((w) => w.toLocaleLowerCase()).join('_');
        case 'kebab':
          return words.map((w) => w.toLocaleLowerCase()).join('-');
        case 'constant':
          return words.map((w) => w.toLocaleUpperCase()).join('_');
        case 'dot':
          return words.map((w) => w.toLocaleLowerCase()).join('.');
        default:
          return line;
      }
    })
    .join('\n');
}

/* ---------- Line tools ---------- */

export interface CleanOptions {
  trimLines: boolean;
  collapseSpaces: boolean;
  removeEmpty: boolean;
  dedupe: boolean;
  dedupeIgnoreCase: boolean;
  sort: 'none' | 'asc' | 'desc' | 'length' | 'natural';
  reverseLines: boolean;
  reverseText: boolean;
  joinLines: boolean;
  normalizeLineBreaks: boolean;
  removeLineBreaksInParagraphs: boolean;
}

export const DEFAULT_CLEAN: CleanOptions = {
  trimLines: true,
  collapseSpaces: false,
  removeEmpty: false,
  dedupe: false,
  dedupeIgnoreCase: false,
  sort: 'none',
  reverseLines: false,
  reverseText: false,
  joinLines: false,
  normalizeLineBreaks: true,
  removeLineBreaksInParagraphs: false,
};

export function cleanText(input: string, o: CleanOptions): { output: string; removed: number } {
  let text = o.normalizeLineBreaks ? input.replace(/\r\n?/g, '\n') : input;
  if (o.removeLineBreaksInParagraphs) text = text.replace(/([^\n])\n(?!\n)/g, '$1 ');
  let lines = text.split('\n');
  const before = lines.length;
  if (o.trimLines) lines = lines.map((l) => l.trim());
  if (o.collapseSpaces) lines = lines.map((l) => l.replace(/[ \t ]+/g, ' '));
  if (o.removeEmpty) lines = lines.filter((l) => l.trim() !== '');
  if (o.dedupe) {
    const seen = new Set<string>();
    lines = lines.filter((l) => {
      const key = o.dedupeIgnoreCase ? l.toLocaleLowerCase() : l;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  }
  const collator = new Intl.Collator(undefined, { numeric: o.sort === 'natural', sensitivity: 'base' });
  if (o.sort === 'asc' || o.sort === 'natural') lines.sort(collator.compare);
  else if (o.sort === 'desc') lines.sort((a, b) => collator.compare(b, a));
  else if (o.sort === 'length') lines.sort((a, b) => Array.from(a).length - Array.from(b).length || collator.compare(a, b));
  if (o.reverseLines) lines.reverse();
  if (o.reverseText) lines = lines.map((l) => (segment(l, 'grapheme')?.map((s) => s.segment) ?? Array.from(l)).reverse().join(''));
  const output = o.joinLines ? lines.join(' ') : lines.join('\n');
  return { output, removed: Math.max(0, before - lines.length) };
}

/* ---------- Find & replace ---------- */

export interface FindOptions {
  caseSensitive: boolean;
  regex: boolean;
  wholeWord: boolean;
}

export function buildPattern(find: string, o: FindOptions): RegExp {
  let source = o.regex ? find : find.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  if (o.wholeWord) source = `(?<![\\p{L}\\p{N}_])(?:${source})(?![\\p{L}\\p{N}_])`;
  return new RegExp(source, `g${o.caseSensitive ? '' : 'i'}u`);
}

export function findReplace(text: string, find: string, replacement: string, o: FindOptions): { output: string; count: number } {
  if (!find) return { output: text, count: 0 };
  const re = buildPattern(find, o);
  let count = 0;
  const output = text.replace(re, (...args) => {
    count++;
    if (!o.regex) return replacement;
    // Support $1, $<name> and $& in regex mode.
    const groups = typeof args[args.length - 1] === 'object' ? (args[args.length - 1] as Record<string, string>) : undefined;
    const match = args[0] as string;
    const captures = args.slice(1, groups ? -3 : -2) as string[];
    return replacement.replace(/\$(\d+|&|<([^>]+)>)/g, (m, g: string, name?: string) => {
      if (g === '&') return match;
      if (name) return groups?.[name] ?? '';
      const idx = Number(g);
      return idx >= 1 && idx <= captures.length ? captures[idx - 1] ?? '' : m;
    });
  });
  return { output, count };
}

/* ---------- Slugs ---------- */

export function slugify(text: string, opts: { separator?: string; lowercase?: boolean; asciiOnly?: boolean; maxLength?: number } = {}): string {
  const sep = opts.separator ?? '-';
  let s = text.normalize('NFKD');
  // Strip Latin diacritics (é → e) but keep combining marks in other scripts (e.g. Devanagari matras).
  s = s.replace(/([A-Za-z])[̀-ͯ]+/g, '$1').normalize('NFC');
  s = s.replace(/[&]/g, ' and ').replace(/['’]/g, '');
  if (opts.lowercase !== false) s = s.toLocaleLowerCase();
  const pattern = opts.asciiOnly ? /[^a-zA-Z0-9]+/g : /[^\p{L}\p{N}\p{M}]+/gu;
  s = s.replace(pattern, sep);
  const escSep = sep.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  if (sep) s = s.replace(new RegExp(`${escSep}{2,}`, 'g'), sep).replace(new RegExp(`^${escSep}|${escSep}$`, 'g'), '');
  if (opts.maxLength && s.length > opts.maxLength) {
    s = s.slice(0, opts.maxLength);
    if (sep) s = s.replace(new RegExp(`${escSep}[^${escSep}]*$`), '') || s;
  }
  return s;
}

/* ---------- Lorem ipsum ---------- */

const LOREM_WORDS =
  'lorem ipsum dolor sit amet consectetur adipiscing elit sed do eiusmod tempor incididunt ut labore et dolore magna aliqua enim ad minim veniam quis nostrud exercitation ullamco laboris nisi aliquip ex ea commodo consequat duis aute irure in reprehenderit voluptate velit esse cillum fugiat nulla pariatur excepteur sint occaecat cupidatat non proident sunt culpa qui officia deserunt mollit anim id est laborum'.split(
    ' ',
  );

/** Deterministic pseudo-random generator so output is stable for a given seed. */
function mulberry32(seed: number) {
  return () => {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function lorem(count: number, unit: 'paragraphs' | 'sentences' | 'words', opts: { startWithLorem?: boolean; seed?: number } = {}): string {
  const rand = mulberry32(opts.seed ?? 42);
  const n = Math.max(1, Math.min(unit === 'words' ? 5000 : 200, Math.floor(count)));
  const word = () => LOREM_WORDS[Math.floor(rand() * LOREM_WORDS.length)];
  const sentence = () => {
    const len = 6 + Math.floor(rand() * 10);
    const words = Array.from({ length: len }, word);
    if (rand() < 0.3 && len > 8) words[3 + Math.floor(rand() * 3)] += ',';
    const s = words.join(' ');
    return s.charAt(0).toUpperCase() + s.slice(1) + '.';
  };
  const paragraph = () => Array.from({ length: 4 + Math.floor(rand() * 4) }, sentence).join(' ');
  let out: string;
  if (unit === 'words') out = Array.from({ length: n }, word).join(' ');
  else if (unit === 'sentences') out = Array.from({ length: n }, sentence).join(' ');
  else out = Array.from({ length: n }, paragraph).join('\n\n');
  if (opts.startWithLorem !== false) {
    const opener = 'Lorem ipsum dolor sit amet, consectetur adipiscing elit';
    if (unit === 'words') {
      const openerWords = opener.replace(',', '').split(' ');
      const rest = out.split(' ').slice(openerWords.length);
      out = [...openerWords, ...rest].slice(0, n).join(' ');
    } else {
      // Replace the first generated sentence so the requested count is kept.
      const firstEnd = out.indexOf('.');
      out = opener + out.slice(firstEnd);
    }
  }
  return out;
}
