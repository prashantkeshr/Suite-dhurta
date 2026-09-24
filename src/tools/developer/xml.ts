/**
 * XML pretty-printer and minifier based on a small tokenizer, so it has no DOM
 * dependency and never rewrites attribute order or entities. Validation is
 * done separately with the browser's DOMParser.
 */

type Token = { type: 'open' | 'close' | 'selfclose' | 'text' | 'comment' | 'cdata' | 'pi' | 'doctype'; value: string };

export function tokenizeXml(xml: string): Token[] {
  const tokens: Token[] = [];
  const re = /<!--[\s\S]*?-->|<!\[CDATA\[[\s\S]*?\]\]>|<\?[\s\S]*?\?>|<!DOCTYPE[^>[]*(?:\[[\s\S]*?\])?\s*>|<\/[^>]+>|<[^>]+?\/>|<[^>]+>|[^<]+/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(xml))) {
    const v = m[0];
    if (v.startsWith('<!--')) tokens.push({ type: 'comment', value: v });
    else if (v.startsWith('<![CDATA[')) tokens.push({ type: 'cdata', value: v });
    else if (v.startsWith('<?')) tokens.push({ type: 'pi', value: v });
    else if (/^<!DOCTYPE/i.test(v)) tokens.push({ type: 'doctype', value: v });
    else if (v.startsWith('</')) tokens.push({ type: 'close', value: v });
    else if (v.startsWith('<') && v.endsWith('/>')) tokens.push({ type: 'selfclose', value: v });
    else if (v.startsWith('<')) tokens.push({ type: 'open', value: v });
    else tokens.push({ type: 'text', value: v });
  }
  return tokens;
}

export function formatXml(xml: string, indent: string | number = 2): string {
  const unit = typeof indent === 'number' ? ' '.repeat(indent) : indent;
  const tokens = tokenizeXml(xml.trim());
  const out: string[] = [];
  let depth = 0;
  const pad = () => unit.repeat(Math.max(0, depth));
  for (let i = 0; i < tokens.length; i++) {
    const t = tokens[i];
    if (t.type === 'text') {
      const text = t.value.trim();
      if (text) out.push(pad() + text.replace(/\s+/g, ' '));
      continue;
    }
    if (t.type === 'close') {
      depth--;
      out.push(pad() + t.value);
      continue;
    }
    // Keep <a>short text</a> on one line.
    if (t.type === 'open' && tokens[i + 1]?.type === 'text' && tokens[i + 2]?.type === 'close' && !tokens[i + 1].value.includes('\n')) {
      out.push(pad() + t.value + tokens[i + 1].value.trim() + tokens[i + 2].value);
      i += 2;
      continue;
    }
    if (t.type === 'open' && tokens[i + 1]?.type === 'close') {
      out.push(pad() + t.value + tokens[i + 1].value);
      i += 1;
      continue;
    }
    out.push(pad() + t.value.trim());
    if (t.type === 'open') depth++;
  }
  return out.join('\n');
}

export function minifyXml(xml: string): string {
  return tokenizeXml(xml.trim())
    .map((t) => (t.type === 'text' ? t.value.replace(/\s+/g, ' ').trim() : t.type === 'comment' ? '' : t.value))
    .join('');
}

export interface XmlCheck {
  ok: boolean;
  message?: string;
  line?: number;
  column?: number;
}

/** Validate well-formedness with the browser parser (browser only). */
export function validateXml(xml: string): XmlCheck {
  if (typeof DOMParser === 'undefined') return { ok: true };
  const doc = new DOMParser().parseFromString(xml, 'application/xml');
  const err = doc.getElementsByTagName('parsererror')[0];
  if (!err) return { ok: true };
  const text = err.textContent ?? 'Invalid XML';
  const lc = text.match(/line\s*(?:number\s*)?(\d+)[^\d]+column\s*(\d+)/i) ?? text.match(/(\d+):(\d+)/);
  return { ok: false, message: text.replace(/\s+/g, ' ').replace(/^This page contains the following errors:/i, '').trim().slice(0, 300), line: lc ? Number(lc[1]) : undefined, column: lc ? Number(lc[2]) : undefined };
}
