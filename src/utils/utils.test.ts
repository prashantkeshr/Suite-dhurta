import { describe, expect, it } from 'vitest';
import { outputName, sanitizeFilename, splitName, uniqueNames } from './filename';
import { formatBytes, aspectRatio } from './format';
import { describeError, UserError } from './errors';

describe('filenames', () => {
  it('builds clean output names', () => {
    expect(outputName('photo.jpg', 'resized', 'image/webp')).toBe('photo-resized.webp');
    expect(outputName('document.pdf', 'merged')).toBe('document-merged.pdf');
    expect(outputName('image.PNG', 'compressed', 'image/jpeg')).toBe('image-compressed.jpg');
    expect(outputName('archive.tar.gz', '', 'zip')).toBe('archive.tar.zip');
  });

  it('keeps Hindi and Unicode names intact', () => {
    expect(outputName('मेरी फ़ोटो.jpg', 'resized', 'image/png')).toBe('मेरी फ़ोटो-resized.png');
    expect(sanitizeFilename('日本語 ファイル')).toBe('日本語 ファイル');
  });

  it('removes characters invalid on Windows and reserved names', () => {
    expect(sanitizeFilename('a<b>c:d"e/f\\g|h?i*j')).toBe('a-b-c-d-e-f-g-h-i-j');
    expect(sanitizeFilename('CON')).toBe('file');
    expect(sanitizeFilename('   ...  ')).toBe('file');
    expect(sanitizeFilename('x'.repeat(400)).length).toBe(180);
  });

  it('splits names', () => {
    expect(splitName('a.b.c')).toEqual(['a.b', 'c']);
    expect(splitName('.env')).toEqual(['.env', '']);
    expect(splitName('README')).toEqual(['README', '']);
  });

  it('makes ZIP entry names unique, even against existing numbered names', () => {
    expect(uniqueNames(['a.png', 'a.png', 'A.png', 'a (2).png'])).toEqual(['a.png', 'a (2).png', 'A (3).png', 'a (2) (2).png']);
  });
});

describe('formatting', () => {
  it('formats bytes', () => {
    expect(formatBytes(0)).toBe('0 B');
    expect(formatBytes(1536)).toBe('1.5 KB');
    expect(formatBytes(5 * 1024 * 1024)).toBe('5.0 MB');
    expect(formatBytes(-1)).toBe('—');
  });
  it('reduces aspect ratios', () => {
    expect(aspectRatio(1920, 1080)).toBe('16:9');
    expect(aspectRatio(0, 5)).toBe('—');
  });
});

describe('errors', () => {
  it('passes UserError through with its guidance', () => {
    const e = describeError(new UserError('Bad file', ['r1'], ['s1']));
    expect(e).toMatchObject({ title: 'Bad file', reasons: ['r1'], suggestions: ['s1'] });
  });
  it('explains encrypted PDFs and memory errors in plain words', () => {
    expect(describeError(new Error('Input document to `PDFDocument.load` is encrypted')).title).toMatch(/password/i);
    expect(describeError(new RangeError('Array buffer allocation failed')).title).toMatch(/memory/i);
  });
  it('always provides technical details for unknown errors', () => {
    const e = describeError(new Error('boom'));
    expect(e.reasons.length).toBeGreaterThan(0);
    expect(e.technical).toContain('boom');
  });
});
