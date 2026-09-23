import { LIMITS } from '@/app/config';
import { UserError, throwIfAborted } from '@/utils/errors';
import { formatNumber } from '@/utils/format';
import { computeSize, drawTransformed, rotatedSize, type ImageOps, type ImageResult } from './ops';

const canUseWorker = () => typeof Worker !== 'undefined' && typeof OffscreenCanvas === 'function' && typeof createImageBitmap === 'function';

/** Decode on the main thread via <img>. Needed for SVG and older browsers. */
function loadImageElement(blob: Blob, mime: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(mime === 'image/svg+xml' && !blob.type ? new Blob([blob], { type: 'image/svg+xml' }) : blob);
    const img = new Image();
    img.decoding = 'async';
    img.onload = () => {
      URL.revokeObjectURL(url);
      resolve(img);
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new UserError('This image could not be decoded.', ['The format is not supported by this browser', 'The file may be damaged'], ['Try converting it to PNG or JPEG with another app first']));
    };
    img.src = url;
  });
}

async function processOnMainThread(blob: Blob, inputMime: string, ops: ImageOps, signal: AbortSignal, step: (s: string) => void): Promise<ImageResult> {
  step('Decoding image…');
  const img = await loadImageElement(blob, inputMime);
  throwIfAborted(signal);
  let sw = img.naturalWidth;
  let sh = img.naturalHeight;
  // SVGs without intrinsic size report 0 (or 150×150 in some browsers).
  if (inputMime === 'image/svg+xml' && (!sw || !sh)) {
    sw = 1024;
    sh = 1024;
  }
  const target = computeSize(sw, sh, ops.resize);
  const out = rotatedSize(target.width, target.height, ops.rotate);
  const canvas = document.createElement('canvas');
  canvas.width = out.width;
  canvas.height = out.height;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new UserError('Your browser could not create a drawing surface.', ['The image may be too large for this device'], ['Try a smaller image']);
  step('Processing…');
  drawTransformed(ctx, img, target, ops);
  step('Encoding…');
  const result = await new Promise<Blob | null>((r) => canvas.toBlob(r, ops.mime, ops.mime === 'image/png' ? undefined : ops.quality));
  canvas.width = canvas.height = 0; // release memory promptly
  if (!result) throw new UserError('The browser could not encode the image.', ['The output is too large for this device'], ['Reduce the output dimensions']);
  return { blob: result, width: out.width, height: out.height, sourceWidth: sw, sourceHeight: sh, fallbackFrom: result.type !== ops.mime ? ops.mime : undefined };
}

function processInWorker(blob: Blob, ops: ImageOps, signal: AbortSignal, step: (s: string) => void): Promise<ImageResult> {
  return new Promise((resolve, reject) => {
    const worker = new Worker(new URL('../../workers/image.worker.ts', import.meta.url), { type: 'module' });
    const finish = () => {
      worker.terminate();
      signal.removeEventListener('abort', onAbort);
    };
    const onAbort = () => {
      finish();
      reject(new DOMException('Cancelled', 'AbortError'));
    };
    signal.addEventListener('abort', onAbort);
    worker.onmessage = (e) => {
      const msg = e.data;
      if (msg.type === 'step') step(msg.step);
      else if (msg.type === 'done') {
        finish();
        resolve(msg.result);
      } else if (msg.type === 'error') {
        finish();
        const err = new Error(msg.message);
        err.name = msg.name;
        reject(err);
      }
    };
    worker.onerror = (e) => {
      finish();
      reject(new Error(e.message || 'Image worker failed to start'));
    };
    worker.postMessage({ blob, ops });
  });
}

export interface ProcessOptions {
  inputMime: string;
  useWorker: boolean;
  signal: AbortSignal;
  step: (s: string) => void;
}

/** Process one image. Falls back to the main thread when the worker path is unavailable or fails to decode. */
export async function processImage(file: Blob, ops: ImageOps, opts: ProcessOptions): Promise<ImageResult> {
  throwIfAborted(opts.signal);
  if (file.size === 0) throw new UserError('This file is empty.', ['The file has 0 bytes'], ['Choose the file again']);
  const svg = opts.inputMime === 'image/svg+xml';
  let result: ImageResult;
  if (opts.useWorker && !svg && canUseWorker()) {
    try {
      result = await processInWorker(file, ops, opts.signal, opts.step);
    } catch (err) {
      if ((err as DOMException).name === 'AbortError') throw err;
      // Some browsers decode formats in <img> that createImageBitmap rejects; retry once.
      result = await processOnMainThread(file, opts.inputMime, ops, opts.signal, opts.step);
    }
  } else {
    result = await processOnMainThread(file, opts.inputMime, ops, opts.signal, opts.step);
  }
  if (result.width * result.height > LIMITS.imagePixelsWarn * 4) {
    throw new UserError(`The output (${formatNumber(result.width)} × ${formatNumber(result.height)}) is too large to handle reliably.`, [], ['Choose smaller dimensions']);
  }
  return result;
}

/** Read dimensions without a full processing pass. */
export async function readImageSize(file: Blob, mime: string): Promise<{ width: number; height: number }> {
  if (mime !== 'image/svg+xml' && typeof createImageBitmap === 'function') {
    try {
      const bmp = await createImageBitmap(file);
      const size = { width: bmp.width, height: bmp.height };
      bmp.close();
      return size;
    } catch {
      /* fall through to <img> */
    }
  }
  const img = await loadImageElement(file, mime);
  return { width: img.naturalWidth, height: img.naturalHeight };
}
