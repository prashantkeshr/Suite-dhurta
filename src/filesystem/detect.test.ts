import { describe, expect, it } from 'vitest';
import { detectFromBytes, extensionOf, looksLikeText } from './detect';

const bytes = (...v: number[]) => new Uint8Array(v);
const ascii = (s: string) => new TextEncoder().encode(s);

describe('file detection', () => {
  it('detects formats from magic bytes', () => {
    expect(detectFromBytes(bytes(0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a), 'a.png').mime).toBe('image/png');
    expect(detectFromBytes(bytes(0xff, 0xd8, 0xff, 0xe0), 'a.jpg').mime).toBe('image/jpeg');
    expect(detectFromBytes(ascii('%PDF-1.7\n'), 'a.pdf').mime).toBe('application/pdf');
    expect(detectFromBytes(ascii('RIFF\0\0\0\0WEBPVP8 '), 'a.webp').mime).toBe('image/webp');
    expect(detectFromBytes(ascii('GIF89a'), 'a.gif').mime).toBe('image/gif');
  });

  it('trusts content over a wrong extension and flags the mismatch', () => {
    const d = detectFromBytes(bytes(0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a), 'photo.jpg');
    expect(d.mime).toBe('image/png');
    expect(d.extensionMismatch).toBe(true);
    expect(d.source).toBe('content');
  });

  it('distinguishes Office files inside ZIP containers by extension', () => {
    const zip = bytes(0x50, 0x4b, 0x03, 0x04, 0, 0);
    expect(detectFromBytes(zip, 'report.docx').kind).toBe('document');
    expect(detectFromBytes(zip, 'sheet.xlsx').kind).toBe('spreadsheet');
    expect(detectFromBytes(zip, 'archive.zip').mime).toBe('application/zip');
    expect(detectFromBytes(zip, 'noext').mime).toBe('application/zip');
  });

  it('detects text, JSON and SVG without extensions', () => {
    expect(detectFromBytes(ascii('hello world'), 'notes').mime).toBe('text/plain');
    expect(detectFromBytes(ascii('{"a":1}'), 'data').mime).toBe('application/json');
    expect(detectFromBytes(ascii('<svg xmlns="http://www.w3.org/2000/svg"></svg>'), 'icon').mime).toBe('image/svg+xml');
  });

  it('handles Hindi (UTF-8) text and Unicode file names', () => {
    const d = detectFromBytes(new TextEncoder().encode('नमस्ते दुनिया'), 'हिंदी नोट्स.txt');
    expect(d.mime).toBe('text/plain');
    expect(d.extensionMismatch).toBe(false);
    expect(extensionOf('हिंदी नोट्स.TXT')).toBe('txt');
  });

  it('tolerates a multi-byte character cut at the sample boundary', () => {
    const full = new TextEncoder().encode('क'.repeat(10));
    expect(looksLikeText(full.subarray(0, full.length - 1))).toBe(true);
  });

  it('flags binary content with a text extension', () => {
    expect(detectFromBytes(bytes(0, 1, 2, 3, 0, 255), 'data.csv').extensionMismatch).toBe(true);
  });

  it('handles empty and unknown input', () => {
    expect(detectFromBytes(new Uint8Array(), 'empty.bin').source).toBe('unknown');
    expect(detectFromBytes(bytes(0, 0, 0, 7, 9), 'x.qqq', 'application/x-thing').mime).toBe('application/x-thing');
    expect(extensionOf('.bashrc')).toBe('');
    expect(extensionOf('noext')).toBe('');
  });
});
