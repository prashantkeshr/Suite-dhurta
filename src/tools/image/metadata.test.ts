import { describe, expect, it } from 'vitest';
import { readMetadata, stripJpeg, stripPng, writePngText } from './metadata';

/** Build a little-endian EXIF TIFF block with Make, Model and a GPS location. */
function exifBlock(): Uint8Array {
  const buf = new Uint8Array(200);
  const v = new DataView(buf.buffer);
  const ascii = (at: number, s: string) => { for (let i = 0; i < s.length; i++) buf[at + i] = s.charCodeAt(i); };
  ascii(0, 'II');
  v.setUint16(2, 0x2a, true);
  v.setUint32(4, 8, true);
  // IFD0: 3 entries
  v.setUint16(8, 3, true);
  const entry = (at: number, tag: number, type: number, count: number, val: number) => { v.setUint16(at, tag, true); v.setUint16(at + 2, type, true); v.setUint32(at + 4, count, true); v.setUint32(at + 8, val, true); };
  entry(10, 0x010f, 2, 8, 50); // Make -> offset 50
  entry(22, 0x0110, 2, 8, 58); // Model -> offset 58
  entry(34, 0x8825, 4, 1, 66); // GPS IFD -> offset 66
  v.setUint32(46, 0, true); // next IFD = 0
  ascii(50, 'TestCam\0');
  ascii(58, 'Model X\0');
  // GPS IFD at 66: 4 entries
  v.setUint16(66, 4, true);
  const g = 68;
  // GPSLatitudeRef "N" inline
  v.setUint16(g, 0x0001, true); v.setUint16(g + 2, 2, true); v.setUint32(g + 4, 2, true); buf[g + 8] = 78; // 'N'
  entry(g + 12, 0x0002, 5, 3, 120); // GPSLatitude -> 120
  v.setUint16(g + 24, 0x0003, true); v.setUint16(g + 26, 2, true); v.setUint32(g + 28, 2, true); buf[g + 32] = 69; // 'E'
  entry(g + 36, 0x0004, 5, 3, 144); // GPSLongitude -> 144
  v.setUint32(g + 48, 0, true); // next IFD
  // Rationals: lat 28/1 36/1 0/1
  const rat = (at: number, n: number, d: number) => { v.setUint32(at, n, true); v.setUint32(at + 4, d, true); };
  rat(120, 28, 1); rat(128, 36, 1); rat(136, 0, 1);
  rat(144, 77, 1); rat(152, 12, 1); rat(160, 0, 1);
  return buf.subarray(0, 168);
}

function jpegWithExif(): Uint8Array {
  const tiff = exifBlock();
  const payload = new Uint8Array(6 + tiff.length);
  payload.set([0x45, 0x78, 0x69, 0x66, 0, 0]); // "Exif\0\0"
  payload.set(tiff, 6);
  const app1Size = 2 + payload.length;
  const scan = [0xff, 0xda, 0x00, 0x08, 1, 2, 3, 4, 5, 6, 0x11, 0x22, 0xff, 0xd9];
  const out = [0xff, 0xd8, 0xff, 0xe1, app1Size >> 8, app1Size & 0xff, ...payload, ...scan];
  return new Uint8Array(out);
}

describe('image metadata', () => {
  it('reads EXIF make, model and GPS from a JPEG', () => {
    const m = readMetadata(jpegWithExif());
    expect(m.format).toBe('jpeg');
    expect(m.fields.find((f) => f.tag === 'Make')?.value).toBe('TestCam');
    expect(m.fields.find((f) => f.tag === 'Model')?.value).toBe('Model X');
    expect(m.gps?.lat).toBeCloseTo(28.6, 5);
    expect(m.gps?.lon).toBeCloseTo(77.2, 5);
    expect(m.fields.find((f) => f.tag === 'GPS location')?.sensitive).toBe(true);
    expect(m.hasMetadata).toBe(true);
  });

  it('strips EXIF losslessly, keeping the image scan', () => {
    const jpeg = jpegWithExif();
    const stripped = stripJpeg(jpeg);
    expect(stripped.length).toBeLessThan(jpeg.length);
    // SOI preserved, APP1 gone, SOS + EOI preserved.
    expect([stripped[0], stripped[1]]).toEqual([0xff, 0xd8]);
    expect([stripped[2], stripped[3]]).toEqual([0xff, 0xda]);
    expect([stripped.at(-2), stripped.at(-1)]).toEqual([0xff, 0xd9]);
    expect(readMetadata(stripped).hasMetadata).toBe(false);
  });

  it('reads and strips PNG text chunks', () => {
    const ihdr = [0, 0, 0, 13]; // length 13
    const chunk = (type: string, data: number[]) => {
      const len = [(data.length >> 24) & 255, (data.length >> 16) & 255, (data.length >> 8) & 255, data.length & 255];
      return [...len, ...[...type].map((c) => c.charCodeAt(0)), ...data, 0, 0, 0, 0];
    };
    const sig = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
    const text = [...'Comment'].map((c) => c.charCodeAt(0)).concat(0, ...[...'secret location'].map((c) => c.charCodeAt(0)));
    const png = new Uint8Array([...sig, ...ihdr, ...[...'IHDR'].map((c) => c.charCodeAt(0)), ...new Array(13).fill(0), 0, 0, 0, 0, ...chunk('tEXt', text), ...chunk('IEND', [])]);
    const m = readMetadata(png);
    expect(m.format).toBe('png');
    expect(m.fields.find((f) => f.tag === 'Comment')?.value).toBe('secret location');
    const stripped = stripPng(png);
    expect(readMetadata(stripped).hasMetadata).toBe(false);
    expect(stripped.length).toBeLessThan(png.length);
  });

  it('reports no metadata for a clean file', () => {
    expect(readMetadata(new Uint8Array([0xff, 0xd8, 0xff, 0xda, 0, 2, 0xff, 0xd9])).hasMetadata).toBe(false);
  });

  it('writes PNG text fields that read back (valid CRC)', () => {
    const sig = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
    const u32 = (n: number) => [(n >>> 24) & 255, (n >>> 16) & 255, (n >>> 8) & 255, n & 255];
    const ihdr = [...u32(13), ...[...'IHDR'].map((c) => c.charCodeAt(0)), ...new Array(13).fill(0), 0, 0, 0, 0];
    const iend = [...u32(0), ...[...'IEND'].map((c) => c.charCodeAt(0)), 0, 0, 0, 0];
    const png = new Uint8Array([...sig, ...ihdr, ...iend]);
    const out = writePngText(png, { Author: 'Prashant', Title: 'Sunset', Comment: '' });
    const m = readMetadata(out);
    expect(m.fields.find((f) => f.tag === 'Author')?.value).toBe('Prashant');
    expect(m.fields.find((f) => f.tag === 'Title')?.value).toBe('Sunset');
    expect(m.fields.find((f) => f.tag === 'Comment')).toBeUndefined();
    // Overwriting replaces, not stacks.
    const out2 = writePngText(out, { Author: 'PK' });
    expect(readMetadata(out2).fields.filter((f) => f.tag === 'Author')).toHaveLength(1);
    expect(readMetadata(out2).fields.find((f) => f.tag === 'Author')?.value).toBe('PK');
  });
});
