/**
 * PDF compression in the browser.
 *
 *  - light:  re-save with compressed object streams. Text, links and forms are
 *            kept; savings are usually small.
 *  - strong: every page is rendered and stored as a JPEG image. This is what
 *            shrinks scanned documents and photo-heavy PDFs (often 70–95%),
 *            but text is no longer selectable or searchable.
 *
 * Strong mode can aim for a target size using the same search as images.
 */
import { PDFDocument } from 'pdf-lib';
import type { PDFDocumentProxy } from 'pdfjs-dist';
import { throwIfAborted, UserError } from '@/utils/errors';
import { fitToTarget } from '@/tools/image/targetSize';
import { openForRender, renderPage, canvasToBlob } from './render';

export interface StrongOptions {
  dpi: number;
  quality: number;
  grayscale: boolean;
  targetBytes?: number;
}

type Report = (v: number | null, step: string) => void;

export async function compressLight(file: File): Promise<Blob> {
  const doc = await PDFDocument.load(await file.arrayBuffer(), { updateMetadata: false });
  const bytes = await doc.save({ useObjectStreams: true });
  return new Blob([bytes as BlobPart], { type: 'application/pdf' });
}

function toGray(canvas: HTMLCanvasElement) {
  const ctx = canvas.getContext('2d')!;
  const img = ctx.getImageData(0, 0, canvas.width, canvas.height);
  const d = img.data;
  for (let i = 0; i < d.length; i += 4) {
    const y = 0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2];
    d[i] = d[i + 1] = d[i + 2] = y;
  }
  ctx.putImageData(img, 0, 0);
}

/** Render every page to JPEG and rebuild the PDF at the original page sizes. */
async function rebuild(pdf: PDFDocumentProxy, sizes: { w: number; h: number }[], dpi: number, quality: number, grayscale: boolean, signal: AbortSignal, report: Report, label: string): Promise<Blob> {
  const out = await PDFDocument.create();
  for (let i = 0; i < sizes.length; i++) {
    throwIfAborted(signal);
    report(i / sizes.length, `${label} — page ${i + 1} of ${sizes.length}`);
    // Cap at ~16 megapixels per page so phones do not run out of canvas memory.
    const scale = Math.min(dpi / 72, Math.sqrt(16_000_000 / (sizes[i].w * sizes[i].h)));
    const canvas = await renderPage(pdf, i, scale, { background: '#ffffff', signal });
    if (grayscale) toGray(canvas);
    const jpg = await canvasToBlob(canvas, 'image/jpeg', quality);
    canvas.width = canvas.height = 0;
    const image = await out.embedJpg(new Uint8Array(await jpg.arrayBuffer()));
    const page = out.addPage([sizes[i].w, sizes[i].h]);
    page.drawImage(image, { x: 0, y: 0, width: sizes[i].w, height: sizes[i].h });
  }
  out.setProducer('Dhurta Suite');
  return new Blob([(await out.save()) as BlobPart], { type: 'application/pdf' });
}

export async function compressStrong(file: File, o: StrongOptions, signal: AbortSignal, report: Report): Promise<{ blob: Blob; reached: boolean; dpi: number; quality: number }> {
  report(null, 'Loading PDF renderer…');
  const pdf = await openForRender(file, file.name);
  try {
    const sizes: { w: number; h: number }[] = [];
    for (let i = 1; i <= pdf.numPages; i++) {
      const vp = (await pdf.getPage(i)).getViewport({ scale: 1 });
      sizes.push({ w: vp.width, h: vp.height });
    }
    if (!sizes.length) throw new UserError('This PDF has no pages.');
    if (!o.targetBytes) {
      const blob = await rebuild(pdf, sizes, o.dpi, o.quality, o.grayscale, signal, report, 'Compressing');
      return { blob, reached: true, dpi: o.dpi, quality: o.quality };
    }
    let attempt = 0;
    const out = await fitToTarget(
      async (q, s) => {
        attempt++;
        const blob = await rebuild(pdf, sizes, o.dpi * s, q, o.grayscale, signal, report, `Attempt ${attempt}: ${Math.round(o.dpi * s)} dpi, quality ${Math.round(q * 100)}%`);
        return { result: blob, bytes: blob.size };
      },
      o.targetBytes,
      // Below ~50 dpi text becomes unreadable, so never shrink further than that.
      { minQuality: 0.3, maxQuality: Math.max(0.3, o.quality), minScale: Math.min(1, 50 / o.dpi), maxScaleRounds: 4 },
    );
    return { blob: out.result, reached: out.reached, dpi: Math.round(o.dpi * out.scale), quality: out.quality };
  } finally {
    void pdf.destroy();
  }
}
