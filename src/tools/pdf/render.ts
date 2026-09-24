import type { PDFDocumentProxy, PDFPageProxy } from 'pdfjs-dist';
import { UserError, throwIfAborted } from '@/utils/errors';

/**
 * PDF rendering with pdf.js (legacy build for older Safari/Android). Loaded
 * only when a tool needs previews, text or rasterised pages. Parsing runs in
 * pdf.js's own Web Worker.
 */

type PdfJs = typeof import('pdfjs-dist');
let pdfjsPromise: Promise<PdfJs> | null = null;

export function loadPdfJs(): Promise<PdfJs> {
  if (!pdfjsPromise) {
    pdfjsPromise = Promise.all([import('pdfjs-dist/legacy/build/pdf.mjs'), import('pdfjs-dist/legacy/build/pdf.worker.min.mjs?url')]).then(([lib, worker]) => {
      const pdfjs = lib as unknown as PdfJs;
      pdfjs.GlobalWorkerOptions.workerSrc = (worker as { default: string }).default;
      return pdfjs;
    });
    pdfjsPromise.catch(() => (pdfjsPromise = null));
  }
  return pdfjsPromise;
}

/** Open a PDF for rendering. pdf.js takes ownership of the buffer, so it gets a copy. */
export async function openForRender(file: Blob, name = 'PDF'): Promise<PDFDocumentProxy> {
  const pdfjs = await loadPdfJs();
  const data = new Uint8Array(await file.arrayBuffer());
  try {
    return await pdfjs.getDocument({ data, isEvalSupported: false, disableFontFace: false }).promise;
  } catch (err) {
    const n = (err as { name?: string })?.name;
    if (n === 'PasswordException')
      throw new UserError(`“${name}” is password-protected.`, ['The PDF is encrypted'], ['Open it with your password in a PDF app, save an unprotected copy, then try again'], err);
    if (n === 'InvalidPDFException') throw new UserError(`“${name}” is not a valid PDF.`, ['The file is damaged or not a PDF'], ['Re-save it from a PDF viewer and try again'], err);
    throw err;
  }
}

/** Render one page (0-based) to a canvas at the given scale (1 = 72 dpi). */
export async function renderPage(doc: PDFDocumentProxy, index: number, scale: number, opts: { background?: string; signal?: AbortSignal } = {}): Promise<HTMLCanvasElement> {
  throwIfAborted(opts.signal);
  const page: PDFPageProxy = await doc.getPage(index + 1);
  const viewport = page.getViewport({ scale });
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, Math.floor(viewport.width));
  canvas.height = Math.max(1, Math.floor(viewport.height));
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new UserError('Your browser could not create a drawing surface.', ['The page may be too large to render at this resolution'], ['Choose a lower resolution']);
  ctx.fillStyle = opts.background ?? '#ffffff';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  // 'print' intent renders straight through. The default 'display' intent paces
  // work with requestAnimationFrame, which browsers pause in background tabs, so
  // exports would stall whenever the user switched tabs.
  const task = page.render({ canvasContext: ctx, viewport, intent: 'print' });
  const onAbort = () => task.cancel();
  opts.signal?.addEventListener('abort', onAbort);
  try {
    await task.promise;
  } finally {
    opts.signal?.removeEventListener('abort', onAbort);
    page.cleanup();
  }
  throwIfAborted(opts.signal);
  return canvas;
}

export function canvasToBlob(canvas: HTMLCanvasElement, mime: string, quality?: number): Promise<Blob> {
  return new Promise((resolve, reject) =>
    canvas.toBlob((b) => (b ? resolve(b) : reject(new UserError('The browser could not encode the page image.', ['The page is too large at this resolution'], ['Choose a lower resolution']))), mime, quality),
  );
}

/** Scale so the longest side of page 1 is ~`px` pixels. */
export async function thumbScale(doc: PDFDocumentProxy, index: number, px: number): Promise<number> {
  const page = await doc.getPage(index + 1);
  const vp = page.getViewport({ scale: 1 });
  return px / Math.max(vp.width, vp.height);
}

interface TextItemLike {
  str: string;
  transform: number[];
  hasEOL?: boolean;
  width?: number;
}

/**
 * Extract a page's text, rebuilding lines from item positions. Items on the
 * same baseline are joined; a new line starts when the y position changes.
 */
export async function pageText(doc: PDFDocumentProxy, index: number): Promise<string> {
  const page = await doc.getPage(index + 1);
  const content = await page.getTextContent();
  const lines: string[] = [];
  let line = '';
  let lastY: number | null = null;
  let lastEnd: number | null = null;
  for (const raw of content.items) {
    const item = raw as TextItemLike;
    if (typeof item.str !== 'string') continue;
    const x = item.transform[4];
    const y = item.transform[5];
    const size = Math.hypot(item.transform[2], item.transform[3]) || 10;
    if (lastY !== null && Math.abs(y - lastY) > size * 0.5) {
      lines.push(line);
      line = '';
      lastEnd = null;
    }
    // Insert a space when there's a visible gap between items on a line.
    if (lastEnd !== null && item.str && !line.endsWith(' ') && !item.str.startsWith(' ') && x - lastEnd > size * 0.2) line += ' ';
    line += item.str;
    lastY = y;
    lastEnd = x + (item.width ?? 0);
    if (item.hasEOL) {
      lines.push(line);
      line = '';
      lastY = null;
      lastEnd = null;
    }
  }
  if (line) lines.push(line);
  page.cleanup();
  return lines.map((l) => l.replace(/\s+$/, '')).join('\n').replace(/\n{3,}/g, '\n\n');
}
