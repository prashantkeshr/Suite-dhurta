import { describe, expect, it } from 'vitest';
import { fitToTarget } from './targetSize';

/** Fake encoder: size grows with quality and with area (scale²), like a JPEG roughly does. */
const fake = (base: number) => async (q: number, s: number) => ({ result: { q, s }, bytes: Math.round(base * s * s * (0.15 + q)) });

describe('fit an image under a target size', () => {
  it('keeps full size and the best quality that fits', async () => {
    const r = await fitToTarget(fake(100_000), 80_000);
    expect(r.reached).toBe(true);
    expect(r.scale).toBe(1);
    expect(r.bytes).toBeLessThanOrEqual(80_000);
    expect(r.quality).toBeGreaterThan(0.6);
    expect(r.attempts).toBeLessThanOrEqual(10);
  });
  it('returns at once when the top quality already fits', async () => {
    const r = await fitToTarget(fake(10_000), 50_000);
    expect(r).toMatchObject({ reached: true, quality: 0.92, scale: 1, attempts: 1 });
  });
  it('shrinks the dimensions when quality alone is not enough', async () => {
    const r = await fitToTarget(fake(2_000_000), 20_000);
    expect(r.reached).toBe(true);
    expect(r.bytes).toBeLessThanOrEqual(20_000);
    expect(r.scale).toBeLessThan(1);
  });
  it('scales lossless images only', async () => {
    const r = await fitToTarget(fake(500_000), 50_000, { lossy: false });
    expect(r.reached).toBe(true);
    expect(r.quality).toBe(0.92);
    expect(r.scale).toBeLessThan(0.5);
  });
  it('reports honestly when the target cannot be reached', async () => {
    const r = await fitToTarget(async () => ({ result: null, bytes: 5000 }), 1000);
    expect(r.reached).toBe(false);
    expect(r.bytes).toBe(5000);
  });
});
