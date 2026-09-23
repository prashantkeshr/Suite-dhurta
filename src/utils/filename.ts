const EXT_FOR_MIME: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
  'image/gif': 'gif',
  'image/avif': 'avif',
  'image/svg+xml': 'svg',
  'application/pdf': 'pdf',
  'application/json': 'json',
  'application/zip': 'zip',
  'text/csv': 'csv',
  'text/plain': 'txt',
};

export const extensionForMime = (mime: string) => EXT_FOR_MIME[mime] ?? 'bin';

/** Split "photo.final.JPG" into ["photo.final", "JPG"]. Dotfiles keep their name. */
export function splitName(name: string): [string, string] {
  const i = name.lastIndexOf('.');
  if (i <= 0) return [name, ''];
  return [name.slice(0, i), name.slice(i + 1)];
}

/**
 * Remove characters that are invalid in file names on Windows/macOS/Linux while
 * keeping Unicode (e.g. Hindi) intact.
 */
export function sanitizeFilename(name: string, fallback = 'file'): string {
  const cleaned = name
    .normalize('NFC')
    .replace(/[\u0000-\u001f\u007f<>:"/\\|?*]/g, '-')
    .replace(/\s+/g, ' ')
    .replace(/^[\s.]+|[\s.]+$/g, '')
    .slice(0, 180);
  const reserved = /^(con|prn|aux|nul|com\d|lpt\d)$/i;
  if (!cleaned || reserved.test(cleaned)) return fallback;
  return cleaned;
}

/**
 * Build an output name: ("photo.jpg", "resized", "image/webp") → "photo-resized.webp".
 * Pass `ext` explicitly when the output has no MIME mapping.
 */
export function outputName(original: string, suffix: string, mimeOrExt?: string): string {
  const [base, oldExt] = splitName(original);
  const ext = mimeOrExt ? (mimeOrExt.includes('/') ? extensionForMime(mimeOrExt) : mimeOrExt) : oldExt;
  const stem = sanitizeFilename(suffix ? `${base}-${suffix}` : base);
  return ext ? `${stem}.${ext.toLowerCase()}` : stem;
}

/** Make names unique inside a ZIP: a.png, a (2).png, a (3).png. */
export function uniqueNames(names: string[]): string[] {
  const used = new Set<string>();
  return names.map((n) => {
    let candidate = n;
    const [base, ext] = splitName(n);
    for (let i = 2; used.has(candidate.toLowerCase()); i++) {
      candidate = ext ? `${base} (${i}).${ext}` : `${base} (${i})`;
    }
    used.add(candidate.toLowerCase());
    return candidate;
  });
}
