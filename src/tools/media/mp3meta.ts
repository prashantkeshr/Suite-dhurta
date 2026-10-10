/**
 * Read and write MP3 ID3v2 tags (title, artist, album, year, track, genre,
 * comment). Writing produces a fresh ID3v2.4 tag prepended to the audio; any
 * existing leading ID3v2 tag is replaced. The audio frames are untouched.
 * Pure, so the write→read round-trip is unit-tested.
 */

export interface Mp3Tags {
  title: string;
  artist: string;
  album: string;
  year: string;
  track: string;
  genre: string;
  comment: string;
}

const FRAME: Record<keyof Mp3Tags, string> = {
  title: 'TIT2',
  artist: 'TPE1',
  album: 'TALB',
  year: 'TDRC',
  track: 'TRCK',
  genre: 'TCON',
  comment: 'COMM',
};
const BY_ID = Object.fromEntries(Object.entries(FRAME).map(([k, v]) => [v, k])) as Record<string, keyof Mp3Tags>;

const blank = (): Mp3Tags => ({ title: '', artist: '', album: '', year: '', track: '', genre: '', comment: '' });

const synchsafe = (n: number) => new Uint8Array([(n >>> 21) & 0x7f, (n >>> 14) & 0x7f, (n >>> 7) & 0x7f, n & 0x7f]);
const unsynchsafe = (b: Uint8Array, o: number) => (b[o] << 21) | (b[o + 1] << 14) | (b[o + 2] << 7) | b[o + 3];
const str4 = (b: Uint8Array, o: number) => String.fromCharCode(b[o], b[o + 1], b[o + 2], b[o + 3]);

function decodeText(data: Uint8Array): string {
  if (!data.length) return '';
  const enc = data[0];
  const body = data.subarray(1);
  try {
    if (enc === 1) return new TextDecoder('utf-16').decode(body).replace(/\0+$/, '');
    if (enc === 2) return new TextDecoder('utf-16be').decode(body).replace(/\0+$/, '');
    if (enc === 3) return new TextDecoder('utf-8').decode(body).replace(/\0+$/, '');
    return new TextDecoder('latin1').decode(body).replace(/\0+$/, '');
  } catch {
    return '';
  }
}

/** Offset of the audio after any leading ID3v2 tag. */
export function audioStart(bytes: Uint8Array): number {
  if (bytes.length >= 10 && bytes[0] === 0x49 && bytes[1] === 0x44 && bytes[2] === 0x33) {
    const size = unsynchsafe(bytes, 6);
    const footer = bytes[5] & 0x10 ? 10 : 0;
    return 10 + size + footer;
  }
  return 0;
}

export function readMp3Tags(bytes: Uint8Array): { tags: Mp3Tags; hasTag: boolean } {
  const tags = blank();
  if (!(bytes.length >= 10 && bytes[0] === 0x49 && bytes[1] === 0x44 && bytes[2] === 0x33)) return { tags, hasTag: false };
  const major = bytes[3];
  const tagSize = unsynchsafe(bytes, 6);
  let o = 10;
  const end = Math.min(10 + tagSize, bytes.length);
  while (o + 10 <= end) {
    const id = str4(bytes, o);
    if (!/^[A-Z0-9]{4}$/.test(id)) break; // padding
    const size = major === 4 ? unsynchsafe(bytes, o + 4) : (bytes[o + 4] << 24) | (bytes[o + 5] << 16) | (bytes[o + 6] << 8) | bytes[o + 7];
    const data = bytes.subarray(o + 10, o + 10 + size);
    const key = BY_ID[id];
    if (key) {
      if (id === 'COMM') {
        // encoding(1) + lang(3) + short desc (null-terminated) + text
        const enc = data[0];
        let p = 4;
        if (enc === 1 || enc === 2) while (p + 1 < data.length && !(data[p] === 0 && data[p + 1] === 0)) p += 2;
        else while (p < data.length && data[p] !== 0) p++;
        p += enc === 1 || enc === 2 ? 2 : 1;
        tags.comment = decodeText(new Uint8Array([enc, ...data.subarray(p)]));
      } else tags[key] = decodeText(data);
    }
    o += 10 + size;
  }
  return { tags, hasTag: true };
}

function textFrame(id: string, value: string): Uint8Array {
  const body = new TextEncoder().encode(value);
  const data = id === 'COMM' ? new Uint8Array([0x03, 0x65, 0x6e, 0x67, 0x00, ...body]) /* UTF-8, "eng", empty desc */ : new Uint8Array([0x03, ...body]);
  const frame = new Uint8Array(10 + data.length);
  for (let i = 0; i < 4; i++) frame[i] = id.charCodeAt(i);
  frame.set(synchsafe(data.length), 4);
  frame.set(data, 10);
  return frame;
}

/** Replace the ID3v2 tag with a new ID3v2.4 tag built from `tags`. */
export function setMp3Tags(bytes: Uint8Array, tags: Mp3Tags): Uint8Array {
  const frames: Uint8Array[] = [];
  for (const [key, id] of Object.entries(FRAME) as [keyof Mp3Tags, string][]) {
    if (tags[key]?.trim()) frames.push(textFrame(id, tags[key].trim()));
  }
  const framesSize = frames.reduce((a, f) => a + f.length, 0);
  const header = new Uint8Array(10);
  header.set([0x49, 0x44, 0x33, 0x04, 0x00, 0x00]); // "ID3" v2.4, flags 0
  header.set(synchsafe(framesSize), 6);

  const audio = bytes.subarray(audioStart(bytes));
  const out = new Uint8Array(10 + framesSize + audio.length);
  out.set(header, 0);
  let p = 10;
  for (const f of frames) {
    out.set(f, p);
    p += f.length;
  }
  out.set(audio, p);
  return out;
}
