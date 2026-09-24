import { canvasToBlob } from './render';

/**
 * Render text to a transparent PNG using the browser's fonts. Used for
 * watermarks and typed signatures so any script the device can display
 * (Hindi, Tamil, Arabic…) works — the standard PDF fonts only cover Latin.
 */
export async function textToPng(text: string, opts: { fontFamily?: string; bold?: boolean; italic?: boolean; color?: string; px?: number } = {}): Promise<Uint8Array> {
  const px = opts.px ?? 160;
  const font = `${opts.italic ? 'italic ' : ''}${opts.bold ? '700 ' : '400 '}${px}px ${opts.fontFamily ?? 'system-ui, "Noto Sans", "Noto Sans Devanagari", sans-serif'}`;
  const lines = text.split('\n').filter((l, _i, a) => l || a.length === 1);
  const measure = document.createElement('canvas').getContext('2d')!;
  measure.font = font;
  const widths = lines.map((l) => measure.measureText(l).width);
  const lineH = Math.ceil(px * 1.3);
  const pad = Math.ceil(px * 0.2);
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, Math.ceil(Math.max(...widths)) + pad * 2);
  canvas.height = Math.max(1, lineH * lines.length + pad * 2);
  const ctx = canvas.getContext('2d')!;
  ctx.font = font;
  ctx.fillStyle = opts.color ?? '#000000';
  ctx.textBaseline = 'middle';
  ctx.textAlign = 'center';
  lines.forEach((l, i) => ctx.fillText(l, canvas.width / 2, pad + lineH * i + lineH / 2));
  const blob = await canvasToBlob(canvas, 'image/png');
  canvas.width = canvas.height = 0;
  return new Uint8Array(await blob.arrayBuffer());
}

/** Convert any browser-decodable image to PNG bytes (pdf-lib embeds PNG/JPEG only). */
export async function imageFileToPng(file: Blob, maxSide = 2000): Promise<Uint8Array> {
  const bmp = await createImageBitmap(file);
  const f = Math.min(1, maxSide / Math.max(bmp.width, bmp.height));
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, Math.round(bmp.width * f));
  canvas.height = Math.max(1, Math.round(bmp.height * f));
  canvas.getContext('2d')!.drawImage(bmp, 0, 0, canvas.width, canvas.height);
  bmp.close();
  const blob = await canvasToBlob(canvas, 'image/png');
  canvas.width = canvas.height = 0;
  return new Uint8Array(await blob.arrayBuffer());
}
