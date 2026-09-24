/** Pure crop-rectangle math, in image pixels. */

export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

export type Handle = 'move' | 'n' | 's' | 'e' | 'w' | 'ne' | 'nw' | 'se' | 'sw';

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

/** Largest centred rectangle with the given aspect (w/h) inside the image. */
export function centeredRect(imgW: number, imgH: number, aspect: number | null): Rect {
  if (!aspect) return { x: 0, y: 0, w: imgW, h: imgH };
  let w = imgW;
  let h = w / aspect;
  if (h > imgH) {
    h = imgH;
    w = h * aspect;
  }
  return normalize({ x: (imgW - w) / 2, y: (imgH - h) / 2, w, h }, imgW, imgH);
}

/** Round to whole pixels and keep inside the image. */
export function normalize(r: Rect, imgW: number, imgH: number): Rect {
  const w = clamp(Math.round(r.w), 1, imgW);
  const h = clamp(Math.round(r.h), 1, imgH);
  return { x: clamp(Math.round(r.x), 0, imgW - w), y: clamp(Math.round(r.y), 0, imgH - h), w, h };
}

/**
 * Apply a drag of (dx, dy) image pixels on a handle to the starting rect.
 * The opposite edge/corner stays fixed; with an aspect ratio the rect keeps it.
 */
export function dragRect(start: Rect, handle: Handle, dx: number, dy: number, imgW: number, imgH: number, aspect: number | null, min = 8): Rect {
  if (handle === 'move') {
    return { ...start, x: clamp(start.x + dx, 0, imgW - start.w), y: clamp(start.y + dy, 0, imgH - start.h) };
  }
  let left = start.x;
  let top = start.y;
  let right = start.x + start.w;
  let bottom = start.y + start.h;
  if (handle.includes('w')) left = clamp(left + dx, 0, right - min);
  if (handle.includes('e')) right = clamp(right + dx, left + min, imgW);
  if (handle.includes('n')) top = clamp(top + dy, 0, bottom - min);
  if (handle.includes('s')) bottom = clamp(bottom + dy, top + min, imgH);

  if (aspect) {
    let w = right - left;
    let h = bottom - top;
    const horizontalOnly = handle === 'e' || handle === 'w';
    const verticalOnly = handle === 'n' || handle === 's';
    if (verticalOnly) w = h * aspect;
    else if (horizontalOnly) h = w / aspect;
    else if (w / h > aspect) w = h * aspect;
    else h = w / aspect;
    // Keep the fixed side anchored; fit inside the image by shrinking.
    const maxW = handle.includes('w') ? start.x + start.w : imgW - left;
    const maxH = handle.includes('n') ? start.y + start.h : imgH - top;
    const f = Math.min(1, maxW / w, maxH / h);
    w *= f;
    h *= f;
    if (handle.includes('w')) left = right - w;
    else right = left + w;
    if (handle.includes('n')) top = bottom - h;
    else if (handle.includes('s') || horizontalOnly) bottom = top + h;
    if (horizontalOnly) {
      // Grow vertically around the centre for e/w drags.
      const cy = start.y + start.h / 2;
      top = clamp(cy - h / 2, 0, imgH - h);
      bottom = top + h;
    }
    if (verticalOnly) {
      const cx = start.x + start.w / 2;
      left = clamp(cx - w / 2, 0, imgW - w);
      right = left + w;
    }
  }
  return { x: left, y: top, w: right - left, h: bottom - top };
}
