/** Browser helpers: rasterise an SVG string and decode QR codes from pixels. */
import jsQR from 'jsqr';

export async function svgToCanvas(svg: string, width: number): Promise<HTMLCanvasElement> {
  const url = URL.createObjectURL(new Blob([svg], { type: 'image/svg+xml' }));
  try {
    const img = new Image();
    img.decoding = 'async';
    img.src = url;
    await img.decode();
    const ratio = img.naturalHeight / img.naturalWidth || 1;
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = Math.round(width * ratio);
    const ctx = canvas.getContext('2d')!;
    ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
    return canvas;
  } finally {
    URL.revokeObjectURL(url);
  }
}

export const canvasToBlob = (canvas: HTMLCanvasElement, type = 'image/png', quality?: number) =>
  new Promise<Blob>((resolve, reject) => canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('Could not encode the image.'))), type, quality));

/** Decode a QR code from canvas pixels. Tries normal and inverted colours. */
export function decodeCanvas(canvas: HTMLCanvasElement, background?: string): string | null {
  const ctx = canvas.getContext('2d', { willReadFrequently: true })!;
  if (background) {
    // Scanners see transparent pixels as black; composite onto a background first.
    const tmp = document.createElement('canvas');
    tmp.width = canvas.width;
    tmp.height = canvas.height;
    const t = tmp.getContext('2d', { willReadFrequently: true })!;
    t.fillStyle = background;
    t.fillRect(0, 0, tmp.width, tmp.height);
    t.drawImage(canvas, 0, 0);
    return decodeCanvas(tmp);
  }
  const { data, width, height } = ctx.getImageData(0, 0, canvas.width, canvas.height);
  return jsQR(data, width, height, { inversionAttempts: 'attemptBoth' })?.data ?? null;
}

/** Draw an image source scaled so its longer side is at most `max` pixels. */
export function drawScaled(src: CanvasImageSource, w: number, h: number, max: number, canvas = document.createElement('canvas')) {
  const scale = Math.min(1, max / Math.max(w, h));
  canvas.width = Math.max(1, Math.round(w * scale));
  canvas.height = Math.max(1, Math.round(h * scale));
  canvas.getContext('2d', { willReadFrequently: true })!.drawImage(src, 0, 0, canvas.width, canvas.height);
  return canvas;
}

interface DetectorLike {
  detect(src: ImageBitmapSource): Promise<{ rawValue: string; format: string }[]>;
}

/** Native BarcodeDetector when the browser has it (also reads 1-D barcodes). */
export async function nativeDetector(): Promise<DetectorLike | null> {
  const BD = (globalThis as unknown as { BarcodeDetector?: { new (o?: { formats: string[] }): DetectorLike; getSupportedFormats(): Promise<string[]> } }).BarcodeDetector;
  if (!BD) return null;
  try {
    const formats = await BD.getSupportedFormats();
    return formats.length ? new BD({ formats }) : null;
  } catch {
    return null;
  }
}

/** Read every code in an image file: native detector first, jsQR as fallback. */
export async function decodeImageFile(file: File): Promise<{ text: string; format: string }[]> {
  const bitmap = await createImageBitmap(file);
  try {
    const det = await nativeDetector();
    if (det) {
      try {
        const found = await det.detect(bitmap);
        if (found.length) return found.map((f) => ({ text: f.rawValue, format: f.format }));
      } catch {
        /* fall back to jsQR */
      }
    }
    for (const max of [1600, 800, 2400]) {
      const text = decodeCanvas(drawScaled(bitmap, bitmap.width, bitmap.height, max), '#ffffff');
      if (text) return [{ text, format: 'qr_code' }];
    }
    return [];
  } finally {
    bitmap.close();
  }
}
