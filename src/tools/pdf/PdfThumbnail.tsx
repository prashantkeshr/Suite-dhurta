import { useEffect, useRef, useState } from 'react';
import { clsx } from 'clsx';
import type { PDFDocumentProxy } from 'pdfjs-dist';
import { renderPage, thumbScale } from './render';

/** Thumbnail cache per document: page index → object URL. Revoked by `releaseThumbnails`. */
const cache = new WeakMap<PDFDocumentProxy, Map<number, Promise<string>>>();

function thumbUrl(doc: PDFDocumentProxy, index: number, px: number): Promise<string> {
  let m = cache.get(doc);
  if (!m) cache.set(doc, (m = new Map()));
  let p = m.get(index);
  if (!p) {
    p = (async () => {
      const canvas = await renderPage(doc, index, await thumbScale(doc, index, px));
      const blob = await new Promise<Blob | null>((r) => canvas.toBlob(r, 'image/jpeg', 0.8));
      canvas.width = canvas.height = 0;
      if (!blob) throw new Error('thumbnail encode failed');
      return URL.createObjectURL(blob);
    })();
    m.set(index, p);
    p.catch(() => m!.delete(index));
  }
  return p;
}

/** Free thumbnail memory and the pdf.js document. Call when a tool closes a PDF. */
export function releaseThumbnails(doc: PDFDocumentProxy | null | undefined) {
  if (!doc) return;
  const m = cache.get(doc);
  m?.forEach((p) => p.then((u) => URL.revokeObjectURL(u)).catch(() => {}));
  cache.delete(doc);
  void doc.destroy();
}

/**
 * Lazily rendered page preview. Renders only when scrolled into view.
 * `rotate` is extra rotation (degrees) to preview before it is applied.
 */
export function PdfThumbnail({ doc, index, rotate = 0, size = 200, className, label }: { doc: PDFDocumentProxy; index: number; rotate?: number; size?: number; className?: string; label?: string }) {
  const ref = useRef<HTMLDivElement>(null);
  const [url, setUrl] = useState<string>();
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    let alive = true;
    const load = () =>
      thumbUrl(doc, index, size)
        .then((u) => alive && setUrl(u))
        .catch(() => alive && setFailed(true));
    if (typeof IntersectionObserver === 'undefined') {
      void load();
      return () => void (alive = false);
    }
    const io = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) {
          io.disconnect();
          void load();
        }
      },
      { rootMargin: '200px' },
    );
    io.observe(el);
    return () => {
      alive = false;
      io.disconnect();
    };
  }, [doc, index, size]);

  return (
    <div ref={ref} className={clsx('flex aspect-square items-center justify-center overflow-hidden', className)}>
      {url ? (
        <img
          src={url}
          alt={label ?? `Page ${index + 1}`}
          draggable={false}
          className="max-h-full max-w-full border border-line bg-white shadow-sm transition-transform"
          style={rotate ? { transform: `rotate(${rotate}deg)` } : undefined}
        />
      ) : (
        <span className="text-xs text-muted">{failed ? 'Preview unavailable' : `Page ${index + 1}`}</span>
      )}
    </div>
  );
}
