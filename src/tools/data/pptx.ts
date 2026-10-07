/**
 * Read a PowerPoint (.pptx) file: slide titles and text, speaker notes,
 * embedded media and document properties. A .pptx is a ZIP of XML parts;
 * parsing is done with small regexes over the XML (no DOM needed), so it is
 * unit-tested in Node. Nothing in the file is ever executed.
 */
import { unzipSync, strFromU8 } from 'fflate';

export interface Slide {
  index: number;
  title: string;
  text: string[];
  notes: string;
  hidden: boolean;
}

export interface Media {
  name: string;
  path: string;
  bytes: Uint8Array;
}

export interface Presentation {
  slides: Slide[];
  media: Media[];
  props: [string, string][];
}

const decode = (s: string) =>
  s
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n)))
    .replace(/&#x([0-9a-f]+);/gi, (_, n) => String.fromCodePoint(parseInt(n, 16)))
    .replace(/&amp;/g, '&');

/** Paragraph texts in a chunk of DrawingML: <a:p> … <a:t>run</a:t> … </a:p>. */
function paragraphs(xml: string): string[] {
  const out: string[] = [];
  for (const p of xml.match(/<a:p[\s>][\s\S]*?<\/a:p>/g) ?? []) {
    const t = (p.match(/<a:t(?:\s[^>]*)?>([\s\S]*?)<\/a:t>/g) ?? []).map((r) => decode(r.replace(/<\/?a:t[^>]*>/g, ''))).join('');
    if (t.trim()) out.push(t.trim());
  }
  return out;
}

function slideContent(xml: string): { title: string; text: string[] } {
  const shapes = xml.match(/<p:sp[\s>][\s\S]*?<\/p:sp>/g) ?? [];
  let title = '';
  const text: string[] = [];
  for (const sp of shapes) {
    const ph = /<p:ph[^>]*type="(title|ctrTitle)"/.exec(sp);
    const paras = paragraphs(sp);
    if (ph && !title) title = paras.join(' ');
    else text.push(...paras);
  }
  // Text inside tables and grouped shapes outside <p:sp>.
  for (const frame of xml.match(/<p:graphicFrame[\s\S]*?<\/p:graphicFrame>/g) ?? []) text.push(...paragraphs(frame));
  return { title, text };
}

/** "../media/image1.png" relative to ppt/slides/ → "ppt/media/image1.png". */
function resolve(base: string, target: string): string {
  const parts = base.split('/').slice(0, -1);
  for (const seg of target.split('/')) {
    if (seg === '..') parts.pop();
    else if (seg !== '.') parts.push(seg);
  }
  return parts.join('/');
}

const rels = (files: Record<string, Uint8Array>, part: string) => {
  const relPath = resolve(part, `_rels/${part.split('/').pop()}.rels`);
  const xml = files[relPath] ? strFromU8(files[relPath]) : '';
  const map: Record<string, { target: string; type: string }> = {};
  for (const m of xml.matchAll(/<Relationship\b[^>]*>/g)) {
    const id = /Id="([^"]+)"/.exec(m[0])?.[1];
    const target = /Target="([^"]+)"/.exec(m[0])?.[1];
    const type = /Type="([^"]+)"/.exec(m[0])?.[1] ?? '';
    if (id && target) map[id] = { target: /^[a-z]+:/i.test(target) ? target : resolve(part, target), type };
  }
  return map;
};

const PROP_LABELS: Record<string, string> = {
  'dc:title': 'Title',
  'dc:subject': 'Subject',
  'dc:creator': 'Author',
  'cp:keywords': 'Keywords',
  'dc:description': 'Comments',
  'cp:lastModifiedBy': 'Last modified by',
  'cp:revision': 'Revision',
  'dcterms:created': 'Created',
  'dcterms:modified': 'Modified',
  'cp:category': 'Category',
};

export function readPptx(data: Uint8Array): Presentation {
  let files: Record<string, Uint8Array>;
  try {
    files = unzipSync(data);
  } catch {
    throw new Error('This is not a valid .pptx file (it could not be opened as a ZIP).');
  }
  const presPath = 'ppt/presentation.xml';
  if (!files[presPath]) throw new Error('This file is not a PowerPoint presentation (.pptx). Old .ppt files are not supported — save as .pptx first.');
  const pres = strFromU8(files[presPath]);
  const presRels = rels(files, presPath);
  const order = [...pres.matchAll(/<p:sldId\b[^>]*r:id="([^"]+)"/g)].map((m) => presRels[m[1]]?.target).filter(Boolean) as string[];

  const slides: Slide[] = order.map((path, i) => {
    const xml = files[path] ? strFromU8(files[path]) : '';
    const { title, text } = slideContent(xml);
    const notesRel = Object.values(rels(files, path)).find((r) => r.type.endsWith('/notesSlide'));
    const notesXml = notesRel && files[notesRel.target] ? strFromU8(files[notesRel.target]) : '';
    // Notes slides repeat the slide number in a placeholder; keep only the body text.
    const notes = (notesXml.match(/<p:sp[\s>][\s\S]*?<\/p:sp>/g) ?? [])
      .filter((sp) => /<p:ph[^>]*type="body"/.test(sp))
      .flatMap(paragraphs)
      .join('\n');
    return { index: i + 1, title, text, notes, hidden: /<p:sld\b[^>]*\sshow="0"/.test(xml) };
  });

  const media: Media[] = Object.keys(files)
    .filter((p) => p.startsWith('ppt/media/') && files[p].length)
    .sort((a, b) => a.localeCompare(b, undefined, { numeric: true }))
    .map((p) => ({ name: p.split('/').pop()!, path: p, bytes: files[p] }));

  const props: [string, string][] = [];
  const core = files['docProps/core.xml'] ? strFromU8(files['docProps/core.xml']) : '';
  for (const [tag, label] of Object.entries(PROP_LABELS)) {
    const v = new RegExp(`<${tag}[^>]*>([\\s\\S]*?)</${tag}>`).exec(core)?.[1];
    if (v?.trim()) props.push([label, decode(v.trim())]);
  }
  const app = files['docProps/app.xml'] ? strFromU8(files['docProps/app.xml']) : '';
  const appName = /<Application>([^<]*)<\/Application>/.exec(app)?.[1];
  if (appName) props.push(['Made with', decode(appName)]);
  return { slides, media, props };
}

/** Plain-text outline of the whole deck (for copy, search or a summary). */
export function outline(p: Presentation, withNotes = true): string {
  return p.slides
    .map((s) => [`Slide ${s.index}${s.hidden ? ' (hidden)' : ''}: ${s.title || '(no title)'}`, ...s.text.map((t) => `  • ${t}`), ...(withNotes && s.notes ? [`  Notes: ${s.notes.replace(/\n/g, ' ')}`] : [])].join('\n'))
    .join('\n\n');
}
