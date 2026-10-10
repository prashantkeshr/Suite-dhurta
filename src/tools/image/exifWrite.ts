/**
 * Write EXIF metadata back into a JPEG, in the browser.
 *
 * A new TIFF/EXIF block is built from the edited fields and spliced in as the
 * APP1 segment (any existing EXIF APP1 is replaced; the image scan is never
 * touched). Little-endian. Pure, so the write→read round-trip is unit-tested.
 */

export interface EditableExif {
  dateTaken?: string; // "YYYY:MM:DD HH:MM:SS"
  dateModified?: string;
  make?: string;
  model?: string;
  lens?: string;
  artist?: string;
  copyright?: string;
  software?: string;
  description?: string;
  orientation?: number;
  gps?: { lat: number; lon: number } | null;
}

type Entry = { tag: number; type: 2 | 3 | 4 | 5; data: Uint8Array; count: number };

const enc = (s: string) => new TextEncoder().encode(s);

function asciiEntry(tag: number, value: string): Entry {
  const bytes = new Uint8Array(enc(value).length + 1); // NUL-terminated
  bytes.set(enc(value));
  return { tag, type: 2, data: bytes, count: bytes.length };
}
function shortEntry(tag: number, value: number): Entry {
  const d = new Uint8Array(2);
  new DataView(d.buffer).setUint16(0, value, true);
  return { tag, type: 3, data: d, count: 1 };
}
function rationalEntry(tag: number, rats: [number, number][]): Entry {
  const d = new Uint8Array(rats.length * 8);
  const v = new DataView(d.buffer);
  rats.forEach(([n, den], i) => {
    v.setUint32(i * 8, n, true);
    v.setUint32(i * 8 + 4, den, true);
  });
  return { tag, type: 5, data: d, count: rats.length };
}

function dmsRationals(deg: number): [number, number][] {
  const a = Math.abs(deg);
  const d = Math.floor(a);
  const m = Math.floor((a - d) * 60);
  const s = Math.round((a - d - m / 60) * 3600 * 100); // seconds ×100 for precision
  return [[d, 1], [m, 1], [s, 100]];
}

/** Serialize one IFD plus its external data at a given base offset. Entries are sorted by tag. */
function serializeIfd(entries: Entry[], ifdOffset: number, nextIfd = 0): { table: Uint8Array; dataArea: Uint8Array; dataOffset: number } {
  const sorted = [...entries].sort((a, b) => a.tag - b.tag);
  const tableSize = 2 + sorted.length * 12 + 4;
  const dataOffset = ifdOffset + tableSize;
  const table = new Uint8Array(tableSize);
  const tv = new DataView(table.buffer);
  const dataChunks: Uint8Array[] = [];
  let dataPos = dataOffset;
  tv.setUint16(0, sorted.length, true);
  sorted.forEach((e, i) => {
    const at = 2 + i * 12;
    tv.setUint16(at, e.tag, true);
    tv.setUint16(at + 2, e.type, true);
    tv.setUint32(at + 4, e.count, true);
    if (e.data.length <= 4) {
      table.set(e.data, at + 8); // inline
    } else {
      tv.setUint32(at + 8, dataPos, true);
      const padded = e.data.length % 2 ? new Uint8Array(e.data.length + 1) : e.data; // IFD data is word-aligned
      if (padded !== e.data) padded.set(e.data);
      dataChunks.push(padded);
      dataPos += padded.length;
    }
  });
  tv.setUint32(tableSize - 4, nextIfd, true);
  const dataArea = concat(dataChunks);
  return { table, dataArea, dataOffset: dataPos };
}

const concat = (arrs: Uint8Array[]) => {
  const total = arrs.reduce((a, x) => a + x.length, 0);
  const out = new Uint8Array(total);
  let p = 0;
  for (const a of arrs) {
    out.set(a, p);
    p += a.length;
  }
  return out;
};

/** Build the raw TIFF/EXIF block (what goes after "Exif\0\0"). */
export function buildExifTiff(ex: EditableExif): Uint8Array {
  const ifd0: Entry[] = [];
  if (ex.description) ifd0.push(asciiEntry(0x010e, ex.description));
  if (ex.make) ifd0.push(asciiEntry(0x010f, ex.make));
  if (ex.model) ifd0.push(asciiEntry(0x0110, ex.model));
  if (ex.orientation && ex.orientation >= 1 && ex.orientation <= 8) ifd0.push(shortEntry(0x0112, ex.orientation));
  if (ex.software) ifd0.push(asciiEntry(0x0131, ex.software));
  if (ex.dateModified) ifd0.push(asciiEntry(0x0132, ex.dateModified));
  if (ex.artist) ifd0.push(asciiEntry(0x013b, ex.artist));
  if (ex.copyright) ifd0.push(asciiEntry(0x8298, ex.copyright));

  const exif: Entry[] = [];
  if (ex.dateTaken) {
    exif.push(asciiEntry(0x9003, ex.dateTaken));
    exif.push(asciiEntry(0x9004, ex.dateTaken));
  }
  if (ex.lens) exif.push(asciiEntry(0xa434, ex.lens));

  const gps: Entry[] = [];
  if (ex.gps) {
    gps.push(asciiEntry(0x0001, ex.gps.lat >= 0 ? 'N' : 'S'));
    gps.push(rationalEntry(0x0002, dmsRationals(ex.gps.lat)));
    gps.push(asciiEntry(0x0003, ex.gps.lon >= 0 ? 'E' : 'W'));
    gps.push(rationalEntry(0x0004, dmsRationals(ex.gps.lon)));
  }

  // IFD0 holds pointer entries to the Exif and GPS sub-IFDs. Pointer values are
  // inline (4 bytes), so adding them changes the table size but not the data
  // size — we can measure layout with placeholder zeros, then fill the offsets.
  const ptr = (tag: number): Entry => ({ tag, type: 4, data: u32le(0), count: 1 });
  const ifd0Full: Entry[] = [...ifd0];
  if (exif.length) ifd0Full.push(ptr(0x8769));
  if (gps.length) ifd0Full.push(ptr(0x8825));

  // Pass 1: measure. IFD0 starts at offset 8 (after the TIFF header).
  const measure = serializeIfd(ifd0Full, 8);
  const exifStart = measure.dataOffset;
  const exifSer = exif.length ? serializeIfd(exif, exifStart) : null;
  const gpsStart = exifSer ? exifSer.dataOffset : exifStart;
  const gpsSer = gps.length ? serializeIfd(gps, gpsStart) : null;

  // Fill the real sub-IFD offsets and re-serialize IFD0 (identical layout).
  for (const e of ifd0Full) {
    if (e.tag === 0x8769) e.data = u32le(exifStart);
    if (e.tag === 0x8825) e.data = u32le(gpsStart);
  }
  const ifd0Ser = serializeIfd(ifd0Full, 8);

  const header = new Uint8Array(8);
  const hv = new DataView(header.buffer);
  hv.setUint16(0, 0x4949, true); // "II" little-endian
  hv.setUint16(2, 0x2a, true);
  hv.setUint32(4, 8, true); // IFD0 at offset 8

  return concat([header, ifd0Ser.table, ifd0Ser.dataArea, ...(exifSer ? [exifSer.table, exifSer.dataArea] : []), ...(gpsSer ? [gpsSer.table, gpsSer.dataArea] : [])]);
}

const u32le = (n: number) => {
  const d = new Uint8Array(4);
  new DataView(d.buffer).setUint32(0, n, true);
  return d;
};

/** Replace (or add) the EXIF APP1 segment of a JPEG with one built from `ex`. */
export function writeJpegExif(bytes: Uint8Array, ex: EditableExif): Uint8Array {
  const tiff = buildExifTiff(ex);
  const payload = new Uint8Array(6 + tiff.length);
  payload.set(enc('Exif')); // "Exif"
  // bytes 4,5 already 0
  payload.set(tiff, 6);
  const app1 = new Uint8Array(4 + payload.length);
  app1[0] = 0xff;
  app1[1] = 0xe1;
  new DataView(app1.buffer).setUint16(2, payload.length + 2);
  app1.set(payload, 4);

  // Walk segments: keep SOI, keep APP0 (JFIF) if present, drop existing APP1/Exif, insert new APP1, keep the rest.
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const out: Uint8Array[] = [bytes.subarray(0, 2)]; // SOI
  let offset = 2;
  let inserted = false;
  while (offset + 4 <= view.byteLength) {
    const marker = view.getUint16(offset);
    if ((marker & 0xff00) !== 0xff00) break;
    if (marker === 0xffda) {
      if (!inserted) out.push(app1);
      out.push(bytes.subarray(offset)); // scan to end
      inserted = true;
      break;
    }
    const size = 2 + view.getUint16(offset + 2);
    if (marker === 0xffe0) {
      out.push(bytes.subarray(offset, offset + size)); // keep JFIF
    } else if (marker === 0xffe1 && view.getUint32(offset + 4) === 0x45786966) {
      // existing Exif APP1: replace it, insert new one here
      if (!inserted) {
        out.push(app1);
        inserted = true;
      }
    } else {
      if (!inserted && marker !== 0xffe0) {
        out.push(app1); // insert before the first non-APP0 segment
        inserted = true;
      }
      out.push(bytes.subarray(offset, offset + size));
    }
    offset += size;
  }
  if (!inserted) out.push(app1);
  return concat(out);
}

/** Build the editable field set from parsed metadata, for prefilling the editor. */
import type { ImageMetadata } from './metadata';
export function editableFromMeta(meta: ImageMetadata): EditableExif {
  const get = (tag: string) => meta.fields.find((f) => f.tag === tag)?.value;
  return {
    dateTaken: get('Date taken'),
    dateModified: get('Date/time'),
    make: get('Make'),
    model: get('Model'),
    lens: get('Lens model'),
    artist: get('Artist'),
    copyright: get('Copyright'),
    software: get('Software'),
    description: get('Description'),
    orientation: get('Orientation') ? Number(get('Orientation')) : undefined,
    gps: meta.gps ?? null,
  };
}
