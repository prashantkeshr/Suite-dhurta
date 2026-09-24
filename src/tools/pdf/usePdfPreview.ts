import { useEffect, useState } from 'react';
import type { PDFDocumentProxy } from 'pdfjs-dist';
import { openForRender } from './render';
import { releaseThumbnails } from './PdfThumbnail';

/**
 * Open a pdf.js document for previews. Previews are optional: if pdf.js
 * fails, `doc` stays null and tools fall back to plain page tiles.
 */
export function usePdfPreview(file: File | null | undefined) {
  const [doc, setDoc] = useState<PDFDocumentProxy | null>(null);
  const [error, setError] = useState<unknown>(null);
  useEffect(() => {
    if (!file) {
      setDoc(null);
      return;
    }
    let alive = true;
    let opened: PDFDocumentProxy | null = null;
    setError(null);
    openForRender(file, file.name)
      .then((d) => {
        opened = d;
        if (alive) setDoc(d);
        else releaseThumbnails(d);
      })
      .catch((err) => alive && setError(err));
    return () => {
      alive = false;
      setDoc(null);
      if (opened) releaseThumbnails(opened);
    };
  }, [file]);
  return { doc, error };
}
