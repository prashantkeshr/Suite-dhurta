/**
 * Read and edit the core properties of an Office file (.docx/.xlsx/.pptx).
 * These — title, author, and the created/modified dates — live in
 * docProps/core.xml inside the ZIP. We edit that one part and repackage the
 * ZIP, leaving the document content untouched. Pure (fflate), unit-tested.
 */
import { unzipSync, zipSync, strToU8, strFromU8 } from 'fflate';

export interface OfficeMeta {
  title: string;
  author: string;
  subject: string;
  keywords: string;
  /** ISO datetime (W3CDTF). */
  created: string;
  modified: string;
  lastModifiedBy: string;
}

const CORE = 'docProps/core.xml';

const TAG_MAP: Record<keyof OfficeMeta, string> = {
  title: 'dc:title',
  author: 'dc:creator',
  subject: 'dc:subject',
  keywords: 'cp:keywords',
  created: 'dcterms:created',
  modified: 'dcterms:modified',
  lastModifiedBy: 'cp:lastModifiedBy',
};

const xmlEsc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const getTag = (xml: string, tag: string) => new RegExp(`<${tag}[^>]*>([\\s\\S]*?)</${tag}>`).exec(xml)?.[1]?.trim() ?? '';
const unesc = (s: string) => s.replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&');

export const isOfficeZip = (files: Record<string, Uint8Array>) => !!files['[Content_Types].xml'] && !!files[CORE];

export function readOfficeMetaFromZip(files: Record<string, Uint8Array>): OfficeMeta {
  const xml = files[CORE] ? strFromU8(files[CORE]) : '';
  const g = (t: string) => unesc(getTag(xml, t));
  return {
    title: g('dc:title'),
    author: g('dc:creator'),
    subject: g('dc:subject'),
    keywords: g('cp:keywords'),
    created: g('dcterms:created'),
    modified: g('dcterms:modified'),
    lastModifiedBy: g('cp:lastModifiedBy'),
  };
}

export function readOfficeMeta(bytes: Uint8Array): { meta: OfficeMeta; editable: boolean } {
  let files: Record<string, Uint8Array>;
  try {
    files = unzipSync(bytes);
  } catch {
    return { meta: blank(), editable: false };
  }
  if (!isOfficeZip(files)) return { meta: blank(), editable: false };
  return { meta: readOfficeMetaFromZip(files), editable: true };
}

const blank = (): OfficeMeta => ({ title: '', author: '', subject: '', keywords: '', created: '', modified: '', lastModifiedBy: '' });

function buildCoreXml(meta: OfficeMeta): string {
  const parts: string[] = [];
  for (const [key, tag] of Object.entries(TAG_MAP) as [keyof OfficeMeta, string][]) {
    const v = meta[key];
    if (!v) continue;
    const attr = key === 'created' || key === 'modified' ? ' xsi:type="dcterms:W3CDTF"' : '';
    parts.push(`<${tag}${attr}>${xmlEsc(v)}</${tag}>`);
  }
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<cp:coreProperties xmlns:cp="http://schemas.openxmlformats.org/package/2006/metadata/core-properties" xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:dcterms="http://purl.org/dc/terms/" xmlns:dcmitype="http://purl.org/dc/dcmitype/" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">${parts.join('')}</cp:coreProperties>`;
}

/** Repackage the Office file with new core properties. Returns a new ZIP. */
export function setOfficeMeta(bytes: Uint8Array, meta: OfficeMeta): Uint8Array {
  const files = unzipSync(bytes);
  if (!isOfficeZip(files)) throw new Error('This is not a .docx, .xlsx or .pptx file.');
  files[CORE] = strToU8(buildCoreXml(meta));
  return zipSync(files, { level: 6 });
}
