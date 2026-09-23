import { PDFDocument, PDFDict, PDFName, degrees, PageSizes } from 'pdf-lib';
import { UserError, throwIfAborted } from '@/utils/errors';
import { detectFile } from '@/filesystem/detect';
import { processImage } from '@/tools/image/engine';
import { jpegOrientation } from '@/tools/image/exif';

export interface LoadedPdf {
  doc: PDFDocument;
  file: File;
  pageCount: number;
}

const encryptedError = (name: string, cause?: unknown) =>
  new UserError(
    `“${name}” is password-protected.`,
    ['The PDF is encrypted, so its pages cannot be changed safely.'],
    ['Open it in the app that created it, enter your password, and save an unprotected copy', 'Then try again with that copy'],
    cause,
  );

/** Load a PDF, rejecting non-PDFs, empty files and encrypted documents with clear messages. */
export async function loadPdf(file: File): Promise<LoadedPdf> {
  if (file.size === 0) throw new UserError(`“${file.name}” is empty.`, ['The file has 0 bytes']);
  const detected = await detectFile(file);
  if (detected.mime !== 'application/pdf') {
    throw new UserError(`“${file.name}” is not a PDF.`, [`Its contents look like: ${detected.label}`], ['Choose a .pdf file']);
  }
  const bytes = await file.arrayBuffer();
  let doc: PDFDocument;
  try {
    doc = await PDFDocument.load(bytes, { updateMetadata: false });
  } catch (err) {
    if (/encrypt/i.test(String((err as Error)?.message))) throw encryptedError(file.name, err);
    throw new UserError(
      `“${file.name}” could not be read.`,
      ['The PDF may be damaged or use features this engine does not support'],
      ['Open it in a PDF viewer and use “Save as” or “Print to PDF”, then try the new copy'],
      err,
    );
  }
  if (doc.isEncrypted) throw encryptedError(file.name);
  return { doc, file, pageCount: doc.getPageCount() };
}

async function finish(doc: PDFDocument): Promise<Blob> {
  const bytes = await doc.save({ useObjectStreams: true });
  return new Blob([bytes as BlobPart], { type: 'application/pdf' });
}

export async function mergePdfs(files: File[], signal: AbortSignal, progress: (v: number, step: string) => void): Promise<{ blob: Blob; pages: number }> {
  const out = await PDFDocument.create();
  for (let i = 0; i < files.length; i++) {
    throwIfAborted(signal);
    progress(i / (files.length + 1), `Adding ${files[i].name}…`);
    const { doc } = await loadPdf(files[i]);
    const pages = await out.copyPages(doc, doc.getPageIndices());
    pages.forEach((p) => out.addPage(p));
  }
  throwIfAborted(signal);
  progress(files.length / (files.length + 1), 'Saving merged PDF…');
  out.setProducer('Dhurta Suite (pdf-lib)');
  return { blob: await finish(out), pages: out.getPageCount() };
}

export async function extractPages(src: PDFDocument, indices: number[]): Promise<Blob> {
  const out = await PDFDocument.create();
  const pages = await out.copyPages(src, indices);
  pages.forEach((p) => out.addPage(p));
  return finish(out);
}

export async function rotatePages(src: PDFDocument, indices: number[], by: 90 | 180 | 270): Promise<Blob> {
  const set = new Set(indices);
  src.getPages().forEach((page, i) => {
    if (set.has(i)) page.setRotation(degrees((page.getRotation().angle + by) % 360));
  });
  return finish(src);
}

export async function deletePages(src: PDFDocument, indices: number[]): Promise<Blob> {
  if (indices.length >= src.getPageCount()) throw new UserError('You cannot delete every page.', ['A PDF must have at least one page'], ['Leave at least one page unselected']);
  // Remove from the end so earlier indices stay valid.
  [...indices].sort((a, b) => b - a).forEach((i) => src.removePage(i));
  return finish(src);
}

export interface PdfInfo {
  title?: string;
  author?: string;
  subject?: string;
  keywords?: string;
  creator?: string;
  producer?: string;
  created?: Date;
  modified?: Date;
  pageCount: number;
  pages: { width: number; height: number; rotation: number }[];
}

export function readInfo(doc: PDFDocument): PdfInfo {
  const safe = <T,>(fn: () => T): T | undefined => {
    try {
      return fn();
    } catch {
      return undefined;
    }
  };
  return {
    title: safe(() => doc.getTitle()),
    author: safe(() => doc.getAuthor()),
    subject: safe(() => doc.getSubject()),
    keywords: safe(() => doc.getKeywords()),
    creator: safe(() => doc.getCreator()),
    producer: safe(() => doc.getProducer()),
    created: safe(() => doc.getCreationDate()),
    modified: safe(() => doc.getModificationDate()),
    pageCount: doc.getPageCount(),
    pages: doc.getPages().map((p) => ({ ...p.getSize(), rotation: p.getRotation().angle })),
  };
}

/** Remove the document Info dictionary entries and the XMP metadata stream. */
export async function stripMetadata(doc: PDFDocument): Promise<Blob> {
  doc.catalog.delete(PDFName.of('Metadata'));
  const infoRef = doc.context.trailerInfo.Info;
  const info = infoRef ? doc.context.lookup(infoRef) : undefined;
  if (info instanceof PDFDict) for (const key of info.keys()) info.delete(key);
  return finish(doc);
}

/** Paper sizes in PDF points (1/72 inch). */
export const PAGE_SIZES = {
  fit: null,
  a4: PageSizes.A4 as [number, number],
  letter: PageSizes.Letter as [number, number],
  legal: PageSizes.Legal as [number, number],
};
export type PageSizeKey = keyof typeof PAGE_SIZES;

export async function imagesToPdf(
  images: { file: File; mime: string }[],
  opts: { size: PageSizeKey; margin: number; orientation: 'auto' | 'portrait' | 'landscape' },
  signal: AbortSignal,
  progress: (v: number, step: string) => void,
): Promise<Blob> {
  const out = await PDFDocument.create();
  for (let i = 0; i < images.length; i++) {
    throwIfAborted(signal);
    const { file, mime } = images[i];
    progress(i / (images.length + 1), `Adding ${file.name}…`);
    let bytes: ArrayBuffer;
    let kind: 'jpg' | 'png';
    if (mime === 'image/jpeg') {
      bytes = await file.arrayBuffer();
      kind = 'jpg';
      // Phone photos often rely on an EXIF rotation flag, which PDF viewers ignore.
      // Re-encode those upright; the browser applies the orientation when decoding.
      if (jpegOrientation(new Uint8Array(bytes, 0, Math.min(bytes.byteLength, 128 * 1024))) !== 1) {
        const r = await processImage(file, { resize: { mode: 'none' }, rotate: 0, flipH: false, flipV: false, mime: 'image/jpeg', quality: 0.92, background: '#ffffff' }, { inputMime: mime, useWorker: true, signal, step: () => {} });
        bytes = await r.blob.arrayBuffer();
      }
    } else if (mime === 'image/png') {
      bytes = await file.arrayBuffer();
      kind = 'png';
    } else {
      // pdf-lib embeds only JPEG and PNG; convert anything else losslessly to PNG.
      const r = await processImage(file, { resize: { mode: 'none' }, rotate: 0, flipH: false, flipV: false, mime: 'image/png', quality: 1, background: '#ffffff' }, { inputMime: mime, useWorker: true, signal, step: () => {} });
      bytes = await r.blob.arrayBuffer();
      kind = 'png';
    }
    let image;
    try {
      image = kind === 'jpg' ? await out.embedJpg(bytes) : await out.embedPng(bytes);
    } catch (err) {
      throw new UserError(`“${file.name}” could not be added to the PDF.`, ['The image may be damaged or use an unusual encoding (for example CMYK or 16-bit PNG)'], ['Re-save the image as a standard JPEG or PNG and try again'], err);
    }
    const base = PAGE_SIZES[opts.size];
    let pageW: number, pageH: number;
    if (!base) {
      pageW = image.width + opts.margin * 2;
      pageH = image.height + opts.margin * 2;
    } else {
      const landscape = opts.orientation === 'landscape' || (opts.orientation === 'auto' && image.width > image.height);
      [pageW, pageH] = landscape ? [base[1], base[0]] : base;
    }
    const page = out.addPage([pageW, pageH]);
    const availW = pageW - opts.margin * 2;
    const availH = pageH - opts.margin * 2;
    const scale = Math.min(availW / image.width, availH / image.height, base ? Infinity : 1);
    const w = image.width * scale;
    const h = image.height * scale;
    page.drawImage(image, { x: (pageW - w) / 2, y: (pageH - h) / 2, width: w, height: h });
  }
  progress(images.length / (images.length + 1), 'Saving PDF…');
  return finish(out);
}
