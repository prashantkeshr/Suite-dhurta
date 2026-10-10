/**
 * Read and edit the internal creation/modification dates of an MP4/MOV file
 * (the "media created" date Windows shows). These live in the mvhd, tkhd and
 * mdhd atoms as seconds since 1904-01-01 UTC. Only those fixed-size fields are
 * overwritten — the media is never re-encoded. Pure, so it is unit-tested.
 */

const EPOCH_OFFSET = 2_082_844_800; // seconds between 1904-01-01 and 1970-01-01
const CONTAINERS = new Set(['moov', 'trak', 'mdia', 'edts', 'udta']);
const DATE_ATOMS = new Set(['mvhd', 'tkhd', 'mdhd']);

export const mp4SecondsToDate = (s: number) => new Date((s - EPOCH_OFFSET) * 1000);
export const dateToMp4Seconds = (d: Date) => Math.floor(d.getTime() / 1000) + EPOCH_OFFSET;

interface Found {
  type: string;
  /** Offset of the version byte (start of the atom body). */
  bodyOffset: number;
}

function walk(view: DataView, start: number, end: number, out: Found[], depth = 0): void {
  let o = start;
  while (o + 8 <= end && depth < 8) {
    let size = view.getUint32(o);
    let header = 8;
    if (size === 1) {
      // 64-bit size: use the low 32 bits (files over 4 GB are out of scope here).
      size = view.getUint32(o + 12);
      header = 16;
    } else if (size === 0) size = end - o;
    if (size < header || o + size > end) break;
    const type = String.fromCharCode(view.getUint8(o + 4), view.getUint8(o + 5), view.getUint8(o + 6), view.getUint8(o + 7));
    if (DATE_ATOMS.has(type)) out.push({ type, bodyOffset: o + header });
    if (CONTAINERS.has(type)) walk(view, o + header, o + size, out, depth + 1);
    o += size;
  }
}

export interface Mp4Dates {
  created?: Date;
  modified?: Date;
  /** True if the file has editable date atoms. */
  editable: boolean;
}

export function readMp4Dates(bytes: Uint8Array): Mp4Dates {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const found: Found[] = [];
  walk(view, 0, bytes.byteLength, found);
  const mvhd = found.find((f) => f.type === 'mvhd');
  if (!mvhd) return { editable: found.length > 0 };
  const version = view.getUint8(mvhd.bodyOffset);
  const at = mvhd.bodyOffset + 4; // skip version(1) + flags(3)
  const read = (p: number) => (version === 1 ? Number(view.getBigUint64(p)) : view.getUint32(p));
  const created = read(at);
  const modified = read(at + (version === 1 ? 8 : 4));
  return { created: created ? mp4SecondsToDate(created) : undefined, modified: modified ? mp4SecondsToDate(modified) : undefined, editable: true };
}

/** Write created/modified into every mvhd/tkhd/mdhd. Returns a new buffer. */
export function setMp4Dates(bytes: Uint8Array, dates: { created?: Date; modified?: Date }): Uint8Array {
  const out = bytes.slice();
  const view = new DataView(out.buffer, out.byteOffset, out.byteLength);
  const found: Found[] = [];
  walk(view, 0, out.byteLength, found);
  const c = dates.created ? dateToMp4Seconds(dates.created) : undefined;
  const m = dates.modified ? dateToMp4Seconds(dates.modified) : undefined;
  for (const f of found) {
    const version = view.getUint8(f.bodyOffset);
    const at = f.bodyOffset + 4;
    const write = (p: number, v: number) => (version === 1 ? view.setBigUint64(p, BigInt(v)) : view.setUint32(p, v >>> 0));
    if (c !== undefined) write(at, c);
    if (m !== undefined) write(at + (version === 1 ? 8 : 4), m);
  }
  return out;
}
