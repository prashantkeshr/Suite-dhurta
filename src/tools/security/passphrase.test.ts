import { describe, expect, it } from 'vitest';
import { long } from '@wordlist/english-eff/long';
import { passphrase, entropyBits, crackTime, randomIndex } from './passphrase';

describe('passphrases', () => {
  it('uses the full 7,776-word EFF list', () => {
    expect(long).toHaveLength(7776);
    expect(new Set(long).size).toBe(7776);
  });
  it('builds phrases with the chosen options', () => {
    const p = passphrase(long, { words: 6, separator: '-', capitalize: false, digit: false });
    const parts = p.split('-');
    expect(parts).toHaveLength(6);
    for (const w of parts) expect(long).toContain(w);
    const c = passphrase(long, { words: 4, separator: ' ', capitalize: true, digit: true });
    expect(c.split(' ')).toHaveLength(4);
    expect(c).toMatch(/\d/);
    expect(c.split(' ').every((w) => /^[A-Z]/.test(w))).toBe(true);
  });
  it('picks uniformly without modulo bias', () => {
    // A fake source that first returns a value in the biased tail, then a fair one.
    const seq = [0xffffffff, 7];
    const rand = (b: Uint32Array) => ((b[0] = seq.shift()!), b);
    expect(randomIndex(10, rand)).toBe(7);
    const counts = new Array(6).fill(0);
    for (let i = 0; i < 6000; i++) counts[randomIndex(6)]++;
    for (const c of counts) expect(c).toBeGreaterThan(800);
  });
  it('reports honest strength', () => {
    expect(entropyBits(7776, { words: 6, digit: false })).toBeCloseTo(77.55, 1);
    expect(crackTime(entropyBits(7776, { words: 6, digit: false }))).toMatch(/million years|billion years|thousand years/);
    expect(crackTime(20)).toBe('instantly');
  });
});
