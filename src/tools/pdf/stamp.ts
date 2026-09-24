import { PDFDocument, StandardFonts, degrees, rgb, type PDFImage, type PDFPage } from 'pdf-lib';
import { UserError } from '@/utils/errors';

/**
 * Drawing on PDF pages in *visual* coordinates — what the reader sees after
 * the page's /Rotate and crop box are applied. Positions are given from the
 * visual bottom-left in points.
 */

export type Anchor = 'top-left' | 'top-center' | 'top-right' | 'middle-left' | 'center' | 'middle-right' | 'bottom-left' | 'bottom-center' | 'bottom-right';

export const ANCHORS: Anchor[] = ['top-left', 'top-center', 'top-right', 'middle-left', 'center', 'middle-right', 'bottom-left', 'bottom-center', 'bottom-right'];

interface Visual {
  width: number;
  height: number;
  rotation: 0 | 90 | 180 | 270;
  crop: { x: number; y: number; width: number; height: number };
}

export function visualBox(page: PDFPage): Visual {
  const crop = page.getCropBox();
  const r = (((page.getRotation().angle % 360) + 360) % 360) as 0 | 90 | 180 | 270;
  const swap = r === 90 || r === 270;
  return { width: swap ? crop.height : crop.width, height: swap ? crop.width : crop.height, rotation: r, crop };
}

/** Convert a visual point to unrotated user space. */
export function visualToUser(v: Visual, vx: number, vy: number): { x: number; y: number } {
  const W = v.crop.width;
  const H = v.crop.height;
  let x: number, y: number;
  switch (v.rotation) {
    case 90:
      x = W - vy;
      y = vx;
      break;
    case 180:
      x = W - vx;
      y = H - vy;
      break;
    case 270:
      x = vy;
      y = H - vx;
      break;
    default:
      x = vx;
      y = vy;
  }
  return { x: x + v.crop.x, y: y + v.crop.y };
}

/** Lower-left corner (visual) for a w×h box at an anchor with a margin. */
export function anchorPoint(v: Visual, anchor: Anchor, w: number, h: number, margin: number): { x: number; y: number } {
  const [vert, horiz] = anchor === 'center' ? ['middle', 'center'] : (anchor.split('-') as [string, string]);
  const x = horiz === 'left' ? margin : horiz === 'right' ? v.width - margin - w : (v.width - w) / 2;
  const y = vert === 'bottom' ? margin : vert === 'top' ? v.height - margin - h : (v.height - h) / 2;
  return { x, y };
}

/**
 * Draw an image whose *visual* box has lower-left (vx, vy) and size w×h,
 * optionally rotated by `angle` degrees counter-clockwise about its centre.
 */
export function drawImageVisual(page: PDFPage, image: PDFImage, box: { x: number; y: number; w: number; h: number }, opts: { opacity?: number; angle?: number } = {}) {
  const v = visualBox(page);
  const angle = opts.angle ?? 0;
  const t = (angle * Math.PI) / 180;
  // Rotate the lower-left corner about the box centre.
  const cx = box.x + box.w / 2;
  const cy = box.y + box.h / 2;
  const ox = -box.w / 2;
  const oy = -box.h / 2;
  const lx = cx + ox * Math.cos(t) - oy * Math.sin(t);
  const ly = cy + ox * Math.sin(t) + oy * Math.cos(t);
  const p = visualToUser(v, lx, ly);
  page.drawImage(image, { x: p.x, y: p.y, width: box.w, height: box.h, opacity: opts.opacity ?? 1, rotate: degrees(v.rotation + angle) });
}

/* ---------- Watermark ---------- */

export interface WatermarkOptions {
  layout: Anchor | 'tile';
  /** Watermark width as a fraction of the visual page width. */
  widthFraction: number;
  opacity: number;
  angle: number;
  margin: number;
}

export async function watermarkPdf(doc: PDFDocument, pages: number[], png: Uint8Array, o: WatermarkOptions): Promise<void> {
  const image = await doc.embedPng(png);
  const all = doc.getPages();
  for (const i of pages) {
    const page = all[i];
    const v = visualBox(page);
    const w = v.width * o.widthFraction;
    const h = (w * image.height) / image.width;
    if (o.layout === 'tile') {
      const stepX = w * 1.6;
      const stepY = Math.max(h * 3, 60);
      for (let y = -stepY / 2, row = 0; y < v.height; y += stepY, row++) {
        for (let x = (row % 2 ? stepX / 2 : 0) - stepX / 2; x < v.width; x += stepX) drawImageVisual(page, image, { x, y, w, h }, { opacity: o.opacity, angle: o.angle });
      }
    } else {
      const p = anchorPoint(v, o.layout, w, h, o.margin);
      drawImageVisual(page, image, { x: p.x, y: p.y, w, h }, { opacity: o.opacity, angle: o.angle });
    }
  }
}

/* ---------- Page numbers ---------- */

export interface PageNumberOptions {
  format: string;
  anchor: Anchor;
  fontSize: number;
  margin: number;
  startAt: number;
  color: string;
}

export function formatPageNumber(format: string, n: number, total: number): string {
  return format.replace(/\{n\}/g, String(n)).replace(/\{total\}/g, String(total));
}

const hexToRgb = (hex: string) => {
  const m = hex.replace('#', '').match(/^([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i);
  return m ? rgb(parseInt(m[1], 16) / 255, parseInt(m[2], 16) / 255, parseInt(m[3], 16) / 255) : rgb(0, 0, 0);
};

/** Number the given pages. Numbering counts only the selected pages, starting at `startAt`. */
export async function addPageNumbers(doc: PDFDocument, pages: number[], o: PageNumberOptions): Promise<void> {
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const total = pages.length + o.startAt - 1;
  // Standard PDF fonts cover Latin text only; validate before drawing anything.
  try {
    font.encodeText(formatPageNumber(o.format, 1, 1));
  } catch (err) {
    throw new UserError('The page number text contains characters the standard PDF font cannot show.', ['Only Latin letters, digits and common punctuation are supported for page numbers'], ['Use a format such as “Page {n} of {total}” or “{n}”'], err);
  }
  const color = hexToRgb(o.color);
  const all = doc.getPages();
  pages.forEach((i, k) => {
    const page = all[i];
    const v = visualBox(page);
    const text = formatPageNumber(o.format, o.startAt + k, total);
    const w = font.widthOfTextAtSize(text, o.fontSize);
    const h = font.heightAtSize(o.fontSize, { descender: false });
    const p = anchorPoint(v, o.anchor, w, h, o.margin);
    const u = visualToUser(v, p.x, p.y);
    page.drawText(text, { x: u.x, y: u.y, size: o.fontSize, font, color, rotate: degrees(v.rotation) });
  });
}

/* ---------- Signature / image placement ---------- */

/**
 * Place an image on one page. `cx`, `cy` are the image centre as fractions of
 * the visual page (0,0 = top-left), `widthFraction` is relative to page width.
 */
export async function placeImage(doc: PDFDocument, pageIndex: number, png: Uint8Array, place: { cx: number; cy: number; widthFraction: number }): Promise<void> {
  const image = await doc.embedPng(png);
  const page = doc.getPage(pageIndex);
  const v = visualBox(page);
  const w = v.width * place.widthFraction;
  const h = (w * image.height) / image.width;
  const x = place.cx * v.width - w / 2;
  const y = (1 - place.cy) * v.height - h / 2;
  drawImageVisual(page, image, { x, y, w, h });
}

/* ---------- Organize ---------- */

export interface PlanItem {
  /** Source page index, or null for a blank page. */
  src: number | null;
  /** Extra rotation to apply, in degrees clockwise. */
  rotate: 0 | 90 | 180 | 270;
}

/** Build a new document from a page plan (reorder, duplicate, rotate, insert blanks). */
export async function buildFromPlan(src: PDFDocument, plan: PlanItem[]): Promise<PDFDocument> {
  if (plan.length === 0) throw new UserError('The document would have no pages.', [], ['Keep at least one page']);
  const out = await PDFDocument.create();
  // Each use copies the source page, so duplicates are independent pages.
  for (let k = 0; k < plan.length; k++) {
    const item = plan[k];
    if (item.src === null) {
      // Blank page sized like the nearest real page before it (or A4).
      const prev = plan.slice(0, k).reverse().find((p) => p.src !== null);
      const ref = prev ? src.getPage(prev.src!) : null;
      const size = ref ? ref.getSize() : { width: 595.28, height: 841.89 };
      const blank = out.addPage([size.width, size.height]);
      if (item.rotate) blank.setRotation(degrees(item.rotate));
      continue;
    }
    const [page] = await out.copyPages(src, [item.src]);
    const added = out.addPage(page);
    if (item.rotate) added.setRotation(degrees((added.getRotation().angle + item.rotate) % 360));
  }
  return out;
}
