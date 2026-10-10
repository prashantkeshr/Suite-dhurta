/**
 * Read and remove image metadata (EXIF, GPS, XMP, IPTC) in the browser.
 *
 * Reading parses the JPEG EXIF (TIFF) structure and PNG text chunks directly.
 * Removal is lossless: for JPEG the metadata APP markers are dropped and the
 * image scan is left untouched (no re-compression); for PNG the ancillary
 * text/metadata chunks are removed. Pure functions, so they are unit-tested.
 */

export interface MetaField {
  tag: string;
  value: string;
  /** Location, device serial, owner name and precise timestamps can identify you. */
  sensitive?: boolean;
}

export interface ImageMetadata {
  format: 'jpeg' | 'png' | 'webp' | 'other';
  fields: MetaField[];
  /** Decimal GPS coordinates, when present. */
  gps?: { lat: number; lon: number };
  hasMetadata: boolean;
}

/* ---------- EXIF (TIFF) ---------- */

const TYPE_SIZE: Record<number, number> = { 1: 1, 2: 1, 3: 2, 4: 4, 5: 8, 6: 1, 7: 1, 8: 2, 9: 4, 10: 8, 11: 4, 12: 8 };

const TAGS: Record<number, string> = {
  0x010e: 'Description',
  0x010f: 'Make',
  0x0110: 'Model',
  0x0112: 'Orientation',
  0x0131: 'Software',
  0x0132: 'Date/time',
  0x013b: 'Artist',
  0x8298: 'Copyright',
  0x829a: 'Exposure time',
  0x829d: 'F-number',
  0x8827: 'ISO',
  0x9003: 'Date taken',
  0x9004: 'Date digitized',
  0x920a: 'Focal length',
  0x9209: 'Flash',
  0xa002: 'Image width',
  0xa003: 'Image height',
  0xa420: 'Image unique ID',
  0xa431: 'Camera serial number',
  0xa433: 'Lens make',
  0xa434: 'Lens model',
};

const SENSITIVE_TAGS = new Set(['Date/time', 'Date taken', 'Date digitized', 'Artist', 'Camera serial number', 'Image unique ID', 'Owner name']);

function rational(view: DataView, o: number, little: boolean, signed: boolean): number {
  const n = signed ? view.getInt32(o, little) : view.getUint32(o, little);
  const d = signed ? view.getInt32(o + 4, little) : view.getUint32(o + 4, little);
  return d === 0 ? 0 : n / d;
}

/** Read one IFD, returning tag → formatted value and the raw numeric values for GPS. */
function readIfd(view: DataView, tiff: number, ifd: number, little: boolean): { fields: Map<number, string>; raw: Map<number, number[]> } {
  const fields = new Map<number, string>();
  const raw = new Map<number, number[]>();
  if (ifd + 2 > view.byteLength) return { fields, raw };
  const count = view.getUint16(ifd, little);
  for (let i = 0; i < count; i++) {
    const e = ifd + 2 + i * 12;
    if (e + 12 > view.byteLength) break;
    const tag = view.getUint16(e, little);
    const type = view.getUint16(e + 2, little);
    const num = view.getUint32(e + 4, little);
    const size = (TYPE_SIZE[type] ?? 1) * num;
    const valueOffset = size <= 4 ? e + 8 : tiff + view.getUint32(e + 8, little);
    if (valueOffset + size > view.byteLength) continue;
    try {
      if (type === 2) {
        let s = '';
        for (let k = 0; k < num; k++) {
          const c = view.getUint8(valueOffset + k);
          if (c === 0) break;
          s += String.fromCharCode(c);
        }
        fields.set(tag, s.trim());
      } else if (type === 5 || type === 10) {
        const vals = Array.from({ length: num }, (_, k) => rational(view, valueOffset + k * 8, little, type === 10));
        raw.set(tag, vals);
        fields.set(tag, vals.map((v) => (Number.isInteger(v) ? v : +v.toFixed(4))).join(', '));
      } else if (type === 3 || type === 8) {
        const vals = Array.from({ length: num }, (_, k) => (type === 8 ? view.getInt16(valueOffset + k * 2, little) : view.getUint16(valueOffset + k * 2, little)));
        raw.set(tag, vals);
        fields.set(tag, vals.join(', '));
      } else if (type === 4 || type === 9) {
        const vals = Array.from({ length: num }, (_, k) => (type === 9 ? view.getInt32(valueOffset + k * 4, little) : view.getUint32(valueOffset + k * 4, little)));
        raw.set(tag, vals);
        fields.set(tag, vals.join(', '));
      }
    } catch {
      /* skip malformed tag */
    }
  }
  return { fields, raw };
}

function dms(parts: number[], ref: string): number {
  const v = (parts[0] ?? 0) + (parts[1] ?? 0) / 60 + (parts[2] ?? 0) / 3600;
  return ref === 'S' || ref === 'W' ? -v : v;
}

/** Parse EXIF from the TIFF block that starts at `tiff` in `view`. */
function parseExif(view: DataView, tiff: number): { fields: MetaField[]; gps?: { lat: number; lon: number } } {
  if (tiff + 8 > view.byteLength) return { fields: [] };
  const little = view.getUint16(tiff) === 0x4949;
  const ifd0 = tiff + view.getUint32(tiff + 4, little);
  const main = readIfd(view, tiff, ifd0, little);
  const out = new Map<string, string>();

  for (const [tag, value] of main.fields) if (TAGS[tag] && value) out.set(TAGS[tag], value);

  // Exif sub-IFD (camera settings) via pointer 0x8769.
  const exifPtr = (() => {
    const e = findEntry(view, ifd0, 0x8769, little);
    return e ? tiff + view.getUint32(e + 8, little) : 0;
  })();
  if (exifPtr) for (const [tag, value] of readIfd(view, tiff, exifPtr, little).fields) if (TAGS[tag] && value) out.set(TAGS[tag], value);

  // GPS IFD via pointer 0x8825.
  let gps: { lat: number; lon: number } | undefined;
  const gpsPtr = (() => {
    const e = findEntry(view, ifd0, 0x8825, little);
    return e ? tiff + view.getUint32(e + 8, little) : 0;
  })();
  if (gpsPtr) {
    const g = readIfd(view, tiff, gpsPtr, little);
    const latRef = g.fields.get(0x0001) ?? 'N';
    const lonRef = g.fields.get(0x0003) ?? 'E';
    const lat = g.raw.get(0x0002);
    const lon = g.raw.get(0x0004);
    if (lat && lon) {
      gps = { lat: dms(lat, latRef), lon: dms(lon, lonRef) };
      out.set('GPS location', `${gps.lat.toFixed(6)}, ${gps.lon.toFixed(6)}`);
      const alt = g.raw.get(0x0006)?.[0];
      if (alt) out.set('GPS altitude', `${Math.round(alt)} m`);
    }
  }

  const fields = [...out].map(([tag, value]) => ({ tag, value, sensitive: SENSITIVE_TAGS.has(tag) || tag.startsWith('GPS') }));
  return { fields, gps };
}

function findEntry(view: DataView, ifd: number, tag: number, little: boolean): number | null {
  if (ifd + 2 > view.byteLength) return null;
  const count = view.getUint16(ifd, little);
  for (let i = 0; i < count; i++) {
    const e = ifd + 2 + i * 12;
    if (e + 12 > view.byteLength) break;
    if (view.getUint16(e, little) === tag) return e;
  }
  return null;
}

/* ---------- JPEG ---------- */

function readJpeg(bytes: Uint8Array): ImageMetadata {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const fields: MetaField[] = [];
  let gps: { lat: number; lon: number } | undefined;
  let offset = 2;
  while (offset + 4 <= view.byteLength) {
    const marker = view.getUint16(offset);
    if ((marker & 0xff00) !== 0xff00) break;
    if (marker === 0xffda) break; // start of scan
    const size = view.getUint16(offset + 2);
    const start = offset + 4;
    if (marker === 0xffe1) {
      if (view.getUint32(start) === 0x45786966) {
        const exif = parseExif(view, start + 6);
        fields.push(...exif.fields);
        gps = exif.gps;
      } else {
        const head = ascii(bytes, start, 29);
        if (head.startsWith('http://ns.adobe.com/xap')) fields.push({ tag: 'XMP metadata', value: 'present (Adobe)', sensitive: false });
      }
    } else if (marker === 0xffed) {
      fields.push({ tag: 'IPTC / Photoshop data', value: 'present', sensitive: true });
    } else if (marker === 0xfffe) {
      fields.push({ tag: 'Comment', value: ascii(bytes, start, Math.min(size - 2, 200)) });
    }
    offset += 2 + size;
  }
  return { format: 'jpeg', fields, gps, hasMetadata: fields.length > 0 };
}

/** Rebuild a JPEG without any EXIF, XMP, IPTC or comment markers. Image data is untouched. */
export function stripJpeg(bytes: Uint8Array): Uint8Array {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const keep: [number, number][] = [[0, 2]]; // SOI
  let offset = 2;
  while (offset + 4 <= view.byteLength) {
    const marker = view.getUint16(offset);
    if ((marker & 0xff00) !== 0xff00) break;
    if (marker === 0xffda) {
      keep.push([offset, view.byteLength]); // scan to end
      break;
    }
    const size = 2 + view.getUint16(offset + 2);
    const drop = marker === 0xffe1 || marker === 0xffed || marker === 0xffee || marker === 0xfffe; // APP1(Exif/XMP), APP13(IPTC), APP14, COM
    if (!drop) keep.push([offset, offset + size]);
    offset += size;
  }
  const total = keep.reduce((a, [s, e]) => a + (e - s), 0);
  const out = new Uint8Array(total);
  let p = 0;
  for (const [s, e] of keep) {
    out.set(bytes.subarray(s, e), p);
    p += e - s;
  }
  return out;
}

/* ---------- PNG ---------- */

const PNG_TEXT_CHUNKS = new Set(['tEXt', 'iTXt', 'zTXt', 'eXIf', 'tIME']);

function readPng(bytes: Uint8Array): ImageMetadata {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const fields: MetaField[] = [];
  let offset = 8;
  while (offset + 8 <= view.byteLength) {
    const len = view.getUint32(offset);
    const type = ascii(bytes, offset + 4, 4);
    const dataAt = offset + 8;
    if (type === 'IEND') break;
    if (type === 'tEXt' && dataAt + len <= view.byteLength) {
      const raw = ascii(bytes, dataAt, len);
      const nul = raw.indexOf('\0');
      if (nul > 0) fields.push({ tag: raw.slice(0, nul), value: raw.slice(nul + 1).slice(0, 200) });
    } else if (type === 'iTXt' && dataAt + len <= view.byteLength) {
      const raw = ascii(bytes, dataAt, Math.min(len, 400));
      const key = raw.slice(0, raw.indexOf('\0'));
      fields.push({ tag: key || 'iTXt', value: 'present', sensitive: /xmp/i.test(key) });
    } else if (type === 'eXIf') {
      const exif = parseExif(view, dataAt);
      fields.push(...exif.fields);
    } else if (type === 'tIME') {
      fields.push({ tag: 'Last modified', value: 'present', sensitive: true });
    }
    offset = dataAt + len + 4;
  }
  return { format: 'png', fields, hasMetadata: fields.length > 0 };
}

/** Rebuild a PNG without text/metadata/time chunks. Pixels are untouched. */
export function stripPng(bytes: Uint8Array): Uint8Array {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const keep: [number, number][] = [[0, 8]];
  let offset = 8;
  while (offset + 8 <= view.byteLength) {
    const len = view.getUint32(offset);
    const type = ascii(bytes, offset + 4, 4);
    const end = offset + 12 + len;
    if (!PNG_TEXT_CHUNKS.has(type)) keep.push([offset, end]);
    if (type === 'IEND') break;
    offset = end;
  }
  const total = keep.reduce((a, [s, e]) => a + (e - s), 0);
  const out = new Uint8Array(total);
  let p = 0;
  for (const [s, e] of keep) {
    out.set(bytes.subarray(s, e), p);
    p += e - s;
  }
  return out;
}

/* ---------- entry point ---------- */

const ascii = (b: Uint8Array, at: number, len: number) => {
  let s = '';
  for (let i = 0; i < len && at + i < b.length; i++) s += String.fromCharCode(b[at + i]);
  return s;
};

const isJpeg = (b: Uint8Array) => b[0] === 0xff && b[1] === 0xd8;
const isPng = (b: Uint8Array) => b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47;

export function readMetadata(bytes: Uint8Array): ImageMetadata {
  if (isJpeg(bytes)) return readJpeg(bytes);
  if (isPng(bytes)) return readPng(bytes);
  if (ascii(bytes, 0, 4) === 'RIFF' && ascii(bytes, 8, 4) === 'WEBP') return { format: 'webp', fields: [], hasMetadata: false };
  return { format: 'other', fields: [], hasMetadata: false };
}

/** Remove metadata losslessly where we can (JPEG, PNG); null means "re-encode instead". */
export function stripMetadata(bytes: Uint8Array): Uint8Array | null {
  if (isJpeg(bytes)) return stripJpeg(bytes);
  if (isPng(bytes)) return stripPng(bytes);
  return null;
}

export const canStripLosslessly = (bytes: Uint8Array) => isJpeg(bytes) || isPng(bytes);


/* ---------- PNG text writing ---------- */

const CRC_TABLE = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();

function crc32(bytes: Uint8Array): number {
  let c = 0xffffffff;
  for (let i = 0; i < bytes.length; i++) c = CRC_TABLE[(c ^ bytes[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function pngChunk(type: string, data: Uint8Array): Uint8Array {
  const typeBytes = new Uint8Array([...type].map((ch) => ch.charCodeAt(0)));
  const body = new Uint8Array(typeBytes.length + data.length);
  body.set(typeBytes);
  body.set(data, typeBytes.length);
  const out = new Uint8Array(8 + data.length + 4);
  const v = new DataView(out.buffer);
  v.setUint32(0, data.length);
  out.set(body, 4);
  v.setUint32(out.length - 4, crc32(body));
  return out;
}

/** Rebuild a PNG with the given tEXt key/values (existing text chunks are replaced). */
export function writePngText(bytes: Uint8Array, fields: Record<string, string>): Uint8Array {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const out: Uint8Array[] = [bytes.subarray(0, 8)]; // signature
  let offset = 8;
  let inserted = false;
  const textChunks = () =>
    Object.entries(fields)
      .filter(([, val]) => val.trim())
      .map(([k, val]) => pngChunk('tEXt', new Uint8Array([...[...k.slice(0, 79)].map((c) => c.charCodeAt(0) & 0xff), 0, ...[...val].map((c) => c.charCodeAt(0) & 0xff)])));
  while (offset + 8 <= view.byteLength) {
    const len = view.getUint32(offset);
    const type = String.fromCharCode(bytes[offset + 4], bytes[offset + 5], bytes[offset + 6], bytes[offset + 7]);
    const end = offset + 12 + len;
    if (type === 'IEND') {
      if (!inserted) {
        out.push(...textChunks());
        inserted = true;
      }
      out.push(bytes.subarray(offset, end));
      break;
    }
    if (!PNG_TEXT_CHUNKS.has(type)) out.push(bytes.subarray(offset, end));
    offset = end;
  }
  const total = out.reduce((a, c) => a + c.length, 0);
  const result = new Uint8Array(total);
  let p = 0;
  for (const c of out) {
    result.set(c, p);
    p += c.length;
  }
  return result;
}
