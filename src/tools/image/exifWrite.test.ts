import { describe, expect, it } from 'vitest';
import { writeJpegExif, buildExifTiff } from './exifWrite';
import { readMetadata } from './metadata';

const cleanJpeg = () => new Uint8Array([0xff, 0xd8, 0xff, 0xda, 0x00, 0x08, 1, 2, 3, 4, 5, 6, 0xff, 0xd9]);

describe('EXIF writer', () => {
  it('writes date, camera and GPS that read back correctly', () => {
    const out = writeJpegExif(cleanJpeg(), {
      dateTaken: '2024:01:15 09:30:00',
      make: 'Canon',
      model: 'EOS R5',
      artist: 'Prashant',
      gps: { lat: 28.6139, lon: 77.209 },
    });
    expect([out[0], out[1]]).toEqual([0xff, 0xd8]);
    const m = readMetadata(out);
    expect(m.hasMetadata).toBe(true);
    expect(m.fields.find((f) => f.tag === 'Make')?.value).toBe('Canon');
    expect(m.fields.find((f) => f.tag === 'Model')?.value).toBe('EOS R5');
    expect(m.fields.find((f) => f.tag === 'Artist')?.value).toBe('Prashant');
    expect(m.fields.find((f) => f.tag === 'Date taken')?.value).toBe('2024:01:15 09:30:00');
    expect(m.gps?.lat).toBeCloseTo(28.6139, 3);
    expect(m.gps?.lon).toBeCloseTo(77.209, 3);
    // Scan data is preserved at the end.
    expect([out.at(-2), out.at(-1)]).toEqual([0xff, 0xd9]);
  });

  it('writes southern/western (negative) GPS with correct hemisphere', () => {
    const out = writeJpegExif(cleanJpeg(), { gps: { lat: -33.8688, lon: -70.6693 } });
    const m = readMetadata(out);
    expect(m.gps?.lat).toBeCloseTo(-33.8688, 3);
    expect(m.gps?.lon).toBeCloseTo(-70.6693, 3);
  });

  it('replaces an existing EXIF block instead of stacking', () => {
    const first = writeJpegExif(cleanJpeg(), { make: 'Nikon' });
    const second = writeJpegExif(first, { make: 'Sony' });
    const m = readMetadata(second);
    expect(m.fields.find((f) => f.tag === 'Make')?.value).toBe('Sony');
    // Only one APP1/Exif segment should exist.
    let count = 0;
    const v = new DataView(second.buffer, second.byteOffset, second.byteLength);
    let o = 2;
    while (o + 4 <= v.byteLength) {
      const marker = v.getUint16(o);
      if ((marker & 0xff00) !== 0xff00 || marker === 0xffda) break;
      if (marker === 0xffe1 && v.getUint32(o + 4) === 0x45786966) count++;
      o += 2 + v.getUint16(o + 2);
    }
    expect(count).toBe(1);
  });

  it('produces a valid little-endian TIFF header', () => {
    const tiff = buildExifTiff({ make: 'X' });
    expect([tiff[0], tiff[1]]).toEqual([0x49, 0x49]); // "II"
    expect(new DataView(tiff.buffer).getUint16(2, true)).toBe(0x2a);
  });
});
