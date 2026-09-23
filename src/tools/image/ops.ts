/** Pure image-operation logic shared by the worker and the main thread. */

export type Rotation = 0 | 90 | 180 | 270;
export type OutputMime = 'image/jpeg' | 'image/png' | 'image/webp';

export type ResizeSpec =
  | { mode: 'none' }
  | { mode: 'percent'; percent: number }
  | { mode: 'dimensions'; width?: number; height?: number; keepAspect: boolean; noUpscale?: boolean }
  | { mode: 'maxSide'; max: number };

export interface ImageOps {
  resize: ResizeSpec;
  rotate: Rotation;
  flipH: boolean;
  flipV: boolean;
  mime: OutputMime;
  /** 0–1, ignored for PNG. */
  quality: number;
  /** Background colour used when the output format has no transparency (JPEG). */
  background: string;
}

export interface ImageResult {
  blob: Blob;
  width: number;
  height: number;
  sourceWidth: number;
  sourceHeight: number;
  /** Set when the browser could not encode the requested format and fell back. */
  fallbackFrom?: string;
}

const clampDim = (n: number) => Math.max(1, Math.min(32767, Math.round(n)));

/** Target size before rotation. */
export function computeSize(w: number, h: number, spec: ResizeSpec): { width: number; height: number } {
  switch (spec.mode) {
    case 'none':
      return { width: w, height: h };
    case 'percent': {
      const f = Math.max(0.01, spec.percent / 100);
      return { width: clampDim(w * f), height: clampDim(h * f) };
    }
    case 'maxSide': {
      const longest = Math.max(w, h);
      if (longest <= spec.max) return { width: w, height: h };
      const f = spec.max / longest;
      return { width: clampDim(w * f), height: clampDim(h * f) };
    }
    case 'dimensions': {
      let { width, height } = spec;
      if (!width && !height) return { width: w, height: h };
      if (spec.keepAspect) {
        if (width && height) {
          // Fit inside the box.
          const f = Math.min(width / w, height / h);
          width = w * f;
          height = h * f;
        } else if (width) height = (h * width) / w;
        else if (height) width = (w * height) / h;
      }
      let out = { width: clampDim(width ?? w), height: clampDim(height ?? h) };
      if (spec.noUpscale && (out.width > w || out.height > h)) {
        const f = Math.min(w / out.width, h / out.height);
        out = { width: clampDim(out.width * f), height: clampDim(out.height * f) };
      }
      return out;
    }
  }
}

/** Final canvas size after rotation. */
export function rotatedSize(width: number, height: number, rotate: Rotation) {
  return rotate === 90 || rotate === 270 ? { width: height, height: width } : { width, height };
}

type Ctx = CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D;

/** Draw the source into ctx with resize, rotation and flips applied. */
export function drawTransformed(ctx: Ctx, source: CanvasImageSource, target: { width: number; height: number }, ops: ImageOps) {
  const out = rotatedSize(target.width, target.height, ops.rotate);
  if (ops.mime === 'image/jpeg') {
    ctx.fillStyle = ops.background || '#ffffff';
    ctx.fillRect(0, 0, out.width, out.height);
  }
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';
  ctx.save();
  ctx.translate(out.width / 2, out.height / 2);
  ctx.rotate((ops.rotate * Math.PI) / 180);
  ctx.scale(ops.flipH ? -1 : 1, ops.flipV ? -1 : 1);
  ctx.drawImage(source, -target.width / 2, -target.height / 2, target.width, target.height);
  ctx.restore();
  return out;
}

/** Resolve "keep original" to an encodable output type. */
export function resolveOutputMime(inputMime: string, requested: OutputMime | 'original'): OutputMime {
  if (requested !== 'original') return requested;
  if (inputMime === 'image/jpeg' || inputMime === 'image/png' || inputMime === 'image/webp') return inputMime;
  return 'image/png';
}
