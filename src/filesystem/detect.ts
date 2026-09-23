/**
 * File type detection. The file's own bytes ("magic numbers") are trusted over
 * its extension or the browser-reported MIME type, because both can be wrong.
 */

export type FileKind = 'image' | 'pdf' | 'text' | 'data' | 'archive' | 'document' | 'spreadsheet' | 'presentation' | 'audio' | 'video' | 'unknown';

export interface DetectedFile {
  file: File;
  name: string;
  size: number;
  /** Best-known MIME type (from content when possible). */
  mime: string;
  kind: FileKind;
  /** Short label, e.g. "JPEG image". */
  label: string;
  /** How the MIME was determined. */
  source: 'content' | 'extension' | 'browser' | 'unknown';
  /** True when the extension disagrees with the detected content. */
  extensionMismatch: boolean;
  empty: boolean;
}

interface Signature {
  mime: string;
  label: string;
  kind: FileKind;
  test: (b: Uint8Array) => boolean;
}

const ascii = (b: Uint8Array, offset: number, s: string) => {
  if (b.length < offset + s.length) return false;
  for (let i = 0; i < s.length; i++) if (b[offset + i] !== s.charCodeAt(i)) return false;
  return true;
};
const bytes = (b: Uint8Array, offset: number, seq: number[]) =>
  b.length >= offset + seq.length && seq.every((v, i) => b[offset + i] === v);

const SIGNATURES: Signature[] = [
  { mime: 'image/png', label: 'PNG image', kind: 'image', test: (b) => bytes(b, 0, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]) },
  { mime: 'image/jpeg', label: 'JPEG image', kind: 'image', test: (b) => bytes(b, 0, [0xff, 0xd8, 0xff]) },
  { mime: 'image/gif', label: 'GIF image', kind: 'image', test: (b) => ascii(b, 0, 'GIF87a') || ascii(b, 0, 'GIF89a') },
  { mime: 'image/webp', label: 'WebP image', kind: 'image', test: (b) => ascii(b, 0, 'RIFF') && ascii(b, 8, 'WEBP') },
  { mime: 'image/bmp', label: 'BMP image', kind: 'image', test: (b) => ascii(b, 0, 'BM') && b.length > 14 },
  { mime: 'image/avif', label: 'AVIF image', kind: 'image', test: (b) => ascii(b, 4, 'ftypavif') || ascii(b, 4, 'ftypavis') },
  { mime: 'image/heic', label: 'HEIC image', kind: 'image', test: (b) => ['heic', 'heix', 'mif1', 'msf1', 'hevc'].some((t) => ascii(b, 4, 'ftyp' + t)) },
  { mime: 'image/tiff', label: 'TIFF image', kind: 'image', test: (b) => bytes(b, 0, [0x49, 0x49, 0x2a, 0x00]) || bytes(b, 0, [0x4d, 0x4d, 0x00, 0x2a]) },
  { mime: 'image/x-icon', label: 'ICO icon', kind: 'image', test: (b) => bytes(b, 0, [0x00, 0x00, 0x01, 0x00]) },
  { mime: 'application/pdf', label: 'PDF document', kind: 'pdf', test: (b) => ascii(b, 0, '%PDF-') },
  { mime: 'application/x-7z-compressed', label: '7-Zip archive', kind: 'archive', test: (b) => bytes(b, 0, [0x37, 0x7a, 0xbc, 0xaf, 0x27, 0x1c]) },
  { mime: 'application/gzip', label: 'GZIP archive', kind: 'archive', test: (b) => bytes(b, 0, [0x1f, 0x8b]) },
  { mime: 'application/vnd.rar', label: 'RAR archive', kind: 'archive', test: (b) => ascii(b, 0, 'Rar!') },
  { mime: 'audio/mpeg', label: 'MP3 audio', kind: 'audio', test: (b) => ascii(b, 0, 'ID3') },
  { mime: 'audio/wav', label: 'WAV audio', kind: 'audio', test: (b) => ascii(b, 0, 'RIFF') && ascii(b, 8, 'WAVE') },
  { mime: 'video/mp4', label: 'MP4 video', kind: 'video', test: (b) => ascii(b, 4, 'ftyp') && !ascii(b, 8, 'avi') && !ascii(b, 8, 'hei') && !ascii(b, 8, 'mif') },
  { mime: 'video/webm', label: 'WebM / MKV video', kind: 'video', test: (b) => bytes(b, 0, [0x1a, 0x45, 0xdf, 0xa3]) },
];

/** Office Open XML files are ZIPs; the extension distinguishes them. */
const ZIP_BASED: Record<string, { mime: string; label: string; kind: FileKind }> = {
  docx: { mime: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', label: 'Word document', kind: 'document' },
  xlsx: { mime: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', label: 'Excel workbook', kind: 'spreadsheet' },
  pptx: { mime: 'application/vnd.openxmlformats-officedocument.presentationml.presentation', label: 'PowerPoint presentation', kind: 'presentation' },
  odt: { mime: 'application/vnd.oasis.opendocument.text', label: 'OpenDocument text', kind: 'document' },
  ods: { mime: 'application/vnd.oasis.opendocument.spreadsheet', label: 'OpenDocument spreadsheet', kind: 'spreadsheet' },
  epub: { mime: 'application/epub+zip', label: 'EPUB e-book', kind: 'document' },
};

const BY_EXTENSION: Record<string, { mime: string; label: string; kind: FileKind }> = {
  svg: { mime: 'image/svg+xml', label: 'SVG image', kind: 'image' },
  txt: { mime: 'text/plain', label: 'Text file', kind: 'text' },
  md: { mime: 'text/markdown', label: 'Markdown', kind: 'text' },
  markdown: { mime: 'text/markdown', label: 'Markdown', kind: 'text' },
  csv: { mime: 'text/csv', label: 'CSV data', kind: 'data' },
  tsv: { mime: 'text/tab-separated-values', label: 'TSV data', kind: 'data' },
  json: { mime: 'application/json', label: 'JSON data', kind: 'data' },
  xml: { mime: 'application/xml', label: 'XML data', kind: 'data' },
  yaml: { mime: 'application/yaml', label: 'YAML data', kind: 'data' },
  yml: { mime: 'application/yaml', label: 'YAML data', kind: 'data' },
  html: { mime: 'text/html', label: 'HTML document', kind: 'text' },
  htm: { mime: 'text/html', label: 'HTML document', kind: 'text' },
  css: { mime: 'text/css', label: 'CSS stylesheet', kind: 'text' },
  js: { mime: 'text/javascript', label: 'JavaScript', kind: 'text' },
  heic: { mime: 'image/heic', label: 'HEIC image', kind: 'image' },
  heif: { mime: 'image/heif', label: 'HEIF image', kind: 'image' },
  doc: { mime: 'application/msword', label: 'Word 97-2003 document', kind: 'document' },
  xls: { mime: 'application/vnd.ms-excel', label: 'Excel 97-2003 workbook', kind: 'spreadsheet' },
  ppt: { mime: 'application/vnd.ms-powerpoint', label: 'PowerPoint 97-2003', kind: 'presentation' },
  ...ZIP_BASED,
  zip: { mime: 'application/zip', label: 'ZIP archive', kind: 'archive' },
};

const EXPECTED_MIME_FOR_EXT: Record<string, string> = {
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  png: 'image/png',
  gif: 'image/gif',
  webp: 'image/webp',
  pdf: 'application/pdf',
  bmp: 'image/bmp',
  avif: 'image/avif',
};

export function extensionOf(name: string): string {
  const i = name.lastIndexOf('.');
  return i > 0 ? name.slice(i + 1).toLowerCase() : '';
}

/** Heuristic: does this byte sample look like UTF-8 text (with no NUL bytes)? */
export function looksLikeText(b: Uint8Array): boolean {
  if (b.length === 0) return false;
  for (let i = 0; i < b.length; i++) if (b[i] === 0) return false;
  try {
    // Drop a possibly truncated trailing multi-byte sequence before validating.
    let end = b.length;
    while (end > 0 && end > b.length - 4 && (b[end - 1] & 0xc0) === 0x80) end--;
    if (end > 0 && b[end - 1] >= 0xc0) end--;
    new TextDecoder('utf-8', { fatal: true }).decode(b.subarray(0, end));
    return true;
  } catch {
    return false;
  }
}

/** Pure detection from a header sample — testable without a File object. */
export function detectFromBytes(header: Uint8Array, name: string, browserMime = '') {
  const ext = extensionOf(name);

  for (const sig of SIGNATURES) {
    if (sig.test(header)) {
      const expected = EXPECTED_MIME_FOR_EXT[ext];
      return { mime: sig.mime, label: sig.label, kind: sig.kind, source: 'content' as const, extensionMismatch: !!expected && expected !== sig.mime };
    }
  }
  // ZIP container: Office files, EPUB, or a plain archive.
  if (bytes(header, 0, [0x50, 0x4b, 0x03, 0x04]) || bytes(header, 0, [0x50, 0x4b, 0x05, 0x06])) {
    const z = ZIP_BASED[ext];
    if (z) return { ...z, source: 'content' as const, extensionMismatch: false };
    return { mime: 'application/zip', label: 'ZIP archive', kind: 'archive' as FileKind, source: 'content' as const, extensionMismatch: false };
  }
  const known = BY_EXTENSION[ext];
  if (known) {
    const isTextual = known.kind === 'text' || known.kind === 'data' || known.mime === 'image/svg+xml';
    // A textual extension on binary content is suspicious.
    const mismatch = isTextual && header.length > 0 && !looksLikeText(header);
    return { ...known, source: 'extension' as const, extensionMismatch: mismatch };
  }
  if (looksLikeText(header)) {
    const trimmed = new TextDecoder().decode(header.subarray(0, 256)).trimStart();
    if (trimmed.startsWith('<svg') || (trimmed.startsWith('<?xml') && trimmed.includes('<svg')))
      return { mime: 'image/svg+xml', label: 'SVG image', kind: 'image' as FileKind, source: 'content' as const, extensionMismatch: false };
    if (trimmed.startsWith('{') || trimmed.startsWith('['))
      return { mime: 'application/json', label: 'JSON data', kind: 'data' as FileKind, source: 'content' as const, extensionMismatch: false };
    return { mime: 'text/plain', label: 'Text file', kind: 'text' as FileKind, source: 'content' as const, extensionMismatch: false };
  }
  if (browserMime) return { mime: browserMime, label: browserMime, kind: 'unknown' as FileKind, source: 'browser' as const, extensionMismatch: false };
  return { mime: 'application/octet-stream', label: ext ? `.${ext} file` : 'Unknown file', kind: 'unknown' as FileKind, source: 'unknown' as const, extensionMismatch: false };
}

/** Read the first bytes of a file and detect its type. Only 4 KB is read. */
export async function detectFile(file: File): Promise<DetectedFile> {
  const header = new Uint8Array(await file.slice(0, 4096).arrayBuffer());
  const d = detectFromBytes(header, file.name, file.type);
  return { file, name: file.name, size: file.size, empty: file.size === 0, ...d };
}
