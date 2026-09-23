import { computeSize, drawTransformed, rotatedSize, type ImageOps } from '@/tools/image/ops';

/**
 * Image worker: decode → transform → encode, off the main thread.
 * One worker handles one job; the caller terminates it to cancel.
 */

// Typed view of the worker global (the project compiles against DOM types).
const scope = self as unknown as { postMessage: (msg: unknown) => void; onmessage: ((e: MessageEvent<Request>) => void) | null };

interface Request {
  blob: Blob;
  ops: ImageOps;
}

scope.onmessage = async (e: MessageEvent<Request>) => {
  const { blob, ops } = e.data;
  let bitmap: ImageBitmap | null = null;
  try {
    scope.postMessage({ type: 'step', step: 'Decoding image…' });
    bitmap = await createImageBitmap(blob);
    const target = computeSize(bitmap.width, bitmap.height, ops.resize);
    const out = rotatedSize(target.width, target.height, ops.rotate);

    scope.postMessage({ type: 'step', step: 'Processing…' });
    const canvas = new OffscreenCanvas(out.width, out.height);
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('2D canvas context unavailable in worker');
    drawTransformed(ctx, bitmap, target, ops);
    const sourceWidth = bitmap.width;
    const sourceHeight = bitmap.height;
    bitmap.close();
    bitmap = null;

    scope.postMessage({ type: 'step', step: 'Encoding…' });
    const result = await canvas.convertToBlob({ type: ops.mime, quality: ops.mime === 'image/png' ? undefined : ops.quality });
    scope.postMessage({
      type: 'done',
      result: {
        blob: result,
        width: out.width,
        height: out.height,
        sourceWidth,
        sourceHeight,
        fallbackFrom: result.type !== ops.mime ? ops.mime : undefined,
      },
    });
  } catch (err) {
    bitmap?.close();
    const e2 = err as Error;
    scope.postMessage({ type: 'error', name: e2?.name ?? 'Error', message: e2?.message ?? String(err) });
  }
};
