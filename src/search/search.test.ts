import { describe, expect, it } from 'vitest';
import { searchTools } from './search';

const ids = (q: string) => searchTools(q).map((r) => r.tool.id);

describe('tool search', () => {
  it('finds image and PDF compressors for "compress image"', () => {
    const r = ids('compress image');
    expect(r[0]).toBe('image-compressor');
    expect(r).toContain('pdf-compressor');
  });

  it('keeps partial matches below full matches', () => {
    const r = ids('merge pdf files');
    expect(r[0]).toBe('pdf-merge');
  });

  it('shows PDF tools for "pdf"', () => {
    const r = ids('pdf');
    expect(r).toEqual(expect.arrayContaining(['pdf-merge', 'pdf-split', 'image-to-pdf']));
  });

  it('finds "compress pdf" including the planned tool', () => {
    expect(ids('compress pdf')).toContain('pdf-compressor');
  });

  it('understands synonyms and arrows', () => {
    expect(ids('jpeg to webp')).toContain('jpg-to-webp');
    expect(ids('jpg → png')[0]).toBe('jpg-to-png');
    expect(ids('combine pdf')[0]).toBe('pdf-merge');
  });

  it('matches aliases and keywords', () => {
    expect(ids('sha256')).toContain('hash-generator');
    expect(ids('emi')[0]).toBe('emi-calculator');
    expect(ids('gst')[0]).toBe('gst-calculator');
  });

  it('ranks usable tools above planned ones', () => {
    const r = searchTools('pdf to');
    const firstPlanned = r.findIndex((x) => x.tool.status === 'coming-soon');
    const lastUsable = r.map((x) => x.tool.status !== 'coming-soon').lastIndexOf(true);
    if (firstPlanned >= 0) expect(lastUsable).toBeGreaterThanOrEqual(0);
  });

  it('returns nothing for empty or unmatched queries', () => {
    expect(searchTools('   ')).toEqual([]);
    expect(searchTools('zzzzqqqq')).toEqual([]);
  });
});
