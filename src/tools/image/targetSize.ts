/**
 * Compress an image to fit under a byte target (exam and government forms
 * often require "under 20 KB" or "under 50 KB").
 *
 * Search order: keep full size and find the highest quality that fits
 * (binary search); if even the lowest acceptable quality is too large, shrink
 * the dimensions in proportion to the overshoot and search again.
 * `encode` does the real work, so this logic is unit-testable.
 */

export interface Attempt<T> {
  result: T;
  bytes: number;
  quality: number;
  scale: number;
}

export interface TargetOutcome<T> extends Attempt<T> {
  reached: boolean;
  attempts: number;
}

export interface TargetOptions {
  minQuality?: number;
  maxQuality?: number;
  /** Lossless formats (PNG) can only shrink by scaling. */
  lossy?: boolean;
  maxScaleRounds?: number;
  /** Never shrink below this fraction of the original width. */
  minScale?: number;
}

export async function fitToTarget<T>(
  encode: (quality: number, scale: number) => Promise<{ result: T; bytes: number }>,
  targetBytes: number,
  { minQuality = 0.4, maxQuality = 0.92, lossy = true, maxScaleRounds = 6, minScale = 0.05 }: TargetOptions = {},
): Promise<TargetOutcome<T>> {
  let attempts = 0;
  const run = async (quality: number, scale: number): Promise<Attempt<T>> => {
    attempts++;
    const r = await encode(quality, scale);
    return { ...r, quality, scale };
  };

  let best = null as Attempt<T> | null; // largest attempt that fits
  let smallest = null as Attempt<T> | null; // fallback when nothing fits
  const consider = (a: Attempt<T>) => {
    if (a.bytes <= targetBytes && (!best || a.bytes > best.bytes)) best = a;
    if (!smallest || a.bytes < smallest.bytes) smallest = a;
  };

  let scale = 1;
  for (let round = 0; round <= maxScaleRounds; round++) {
    if (!lossy) {
      const a = await run(maxQuality, scale);
      consider(a);
      if (a.bytes <= targetBytes) break;
      scale = Math.max(minScale, scale * Math.sqrt(targetBytes / a.bytes) * 0.95);
      continue;
    }
    // Quick exits before the binary search.
    const top = await run(maxQuality, scale);
    consider(top);
    if (top.bytes <= targetBytes) break;
    const bottom = await run(minQuality, scale);
    consider(bottom);
    if (bottom.bytes > targetBytes) {
      if (scale <= minScale) break;
      scale = Math.max(minScale, scale * Math.sqrt(targetBytes / bottom.bytes) * 0.95);
      continue;
    }
    // bottom fits, top does not: binary search the quality in between.
    let lo = minQuality;
    let hi = maxQuality;
    for (let i = 0; i < 6 && hi - lo > 0.02; i++) {
      const mid = (lo + hi) / 2;
      const a = await run(mid, scale);
      consider(a);
      if (a.bytes <= targetBytes) lo = mid;
      else hi = mid;
    }
    break;
  }

  const chosen = (best ?? smallest) as Attempt<T>;
  return { ...chosen, reached: !!best, attempts };
}
