import { describe, expect, it } from 'vitest';
import { PDFDocument, degrees } from 'pdf-lib';
import { visualBox, visualToUser, anchorPoint, addPageNumbers, formatPageNumber, watermarkPdf, placeImage, buildFromPlan } from './pdf/stamp';
import { buildIco } from './image/ico';
import { centeredRect, dragRect, normalize } from './image/cropMath';

// 1×1 transparent PNG
const PNG = Uint8Array.from(atob('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg=='), (c) => c.charCodeAt(0));

async function doc(pages: { w: number; h: number; rot?: number }[]) {
  const d = await PDFDocument.create();
  for (const p of pages) {
    const page = d.addPage([p.w, p.h]);
    if (p.rot) page.setRotation(degrees(p.rot));
  }
  return d;
}

describe('visual coordinates on rotated pages', () => {
  it('maps the visual corners to the right user-space corners', async () => {
    const d = await doc([{ w: 600, h: 800 }, { w: 600, h: 800, rot: 90 }, { w: 600, h: 800, rot: 180 }, { w: 600, h: 800, rot: 270 }]);
    const [p0, p90, p180, p270] = d.getPages().map(visualBox);
    expect([p0.width, p0.height]).toEqual([600, 800]);
    expect([p90.width, p90.height]).toEqual([800, 600]);
    // Visual bottom-left corner:
    expect(visualToUser(p0, 0, 0)).toEqual({ x: 0, y: 0 });
    expect(visualToUser(p90, 0, 0)).toEqual({ x: 600, y: 0 });
    expect(visualToUser(p180, 0, 0)).toEqual({ x: 600, y: 800 });
    expect(visualToUser(p270, 0, 0)).toEqual({ x: 0, y: 800 });
    // Visual top-right corner of the 90° page is user origin.
    expect(visualToUser(p90, 800, 600)).toEqual({ x: 0, y: 800 });
  });

  it('places boxes at anchors inside the margins', async () => {
    const v = visualBox((await doc([{ w: 600, h: 800 }])).getPage(0));
    expect(anchorPoint(v, 'bottom-right', 100, 20, 10)).toEqual({ x: 490, y: 10 });
    expect(anchorPoint(v, 'top-left', 100, 20, 10)).toEqual({ x: 10, y: 770 });
    expect(anchorPoint(v, 'center', 100, 20, 10)).toEqual({ x: 250, y: 390 });
  });
});

describe('PDF stamping', () => {
  it('formats page numbers', () => {
    expect(formatPageNumber('Page {n} of {total}', 3, 9)).toBe('Page 3 of 9');
  });

  it('adds page numbers, including on rotated pages, and survives a save/load round trip', async () => {
    const d = await doc([{ w: 595, h: 842 }, { w: 595, h: 842, rot: 90 }]);
    await addPageNumbers(d, [0, 1], { format: 'Page {n} of {total}', anchor: 'bottom-center', fontSize: 11, margin: 24, startAt: 1, color: '#333333' });
    const reloaded = await PDFDocument.load(await d.save());
    expect(reloaded.getPageCount()).toBe(2);
  });

  it('rejects page-number text the standard font cannot encode', async () => {
    const d = await doc([{ w: 595, h: 842 }]);
    await expect(addPageNumbers(d, [0], { format: 'पृष्ठ {n}', anchor: 'bottom-center', fontSize: 11, margin: 24, startAt: 1, color: '#000000' })).rejects.toThrow(/cannot show/);
  });

  it('watermarks (single and tiled) and places a signature image', async () => {
    const d = await doc([{ w: 595, h: 842 }, { w: 842, h: 595, rot: 270 }]);
    await watermarkPdf(d, [0, 1], PNG, { layout: 'center', widthFraction: 0.5, opacity: 0.3, angle: 45, margin: 20 });
    await watermarkPdf(d, [0], PNG, { layout: 'tile', widthFraction: 0.2, opacity: 0.2, angle: 30, margin: 20 });
    await placeImage(d, 1, PNG, { cx: 0.7, cy: 0.9, widthFraction: 0.3 });
    const reloaded = await PDFDocument.load(await d.save());
    expect(reloaded.getPageCount()).toBe(2);
  });

  it('builds a document from a page plan with duplicates, blanks and rotation', async () => {
    const src = await doc([{ w: 600, h: 800 }, { w: 800, h: 600 }]);
    const out = await buildFromPlan(src, [
      { src: 1, rotate: 0 },
      { src: null, rotate: 0 },
      { src: 0, rotate: 90 },
      { src: 0, rotate: 0 },
    ]);
    const pages = out.getPages();
    expect(pages).toHaveLength(4);
    expect(pages[0].getSize()).toEqual({ width: 800, height: 600 });
    expect(pages[1].getSize()).toEqual({ width: 800, height: 600 }); // blank sized like previous page
    expect(pages[2].getRotation().angle).toBe(90);
    expect(pages[3].getRotation().angle).toBe(0);
    await expect(buildFromPlan(src, [])).rejects.toThrow(/no pages/);
  });
});

describe('ICO encoder', () => {
  it('writes a valid header and directory', () => {
    const ico = buildIco([
      { size: 32, png: new Uint8Array([1, 2, 3]) },
      { size: 16, png: new Uint8Array([4, 5]) },
      { size: 256, png: new Uint8Array([6]) },
    ]);
    const v = new DataView(ico.buffer);
    expect(v.getUint16(0, true)).toBe(0);
    expect(v.getUint16(2, true)).toBe(1);
    expect(v.getUint16(4, true)).toBe(3);
    // Sorted by size: 16, 32, 256 (stored as 0).
    expect([ico[6], ico[22], ico[38]]).toEqual([16, 32, 0]);
    expect(v.getUint32(6 + 8, true)).toBe(2); // size of first image
    expect(v.getUint32(6 + 12, true)).toBe(6 + 16 * 3); // offset of first image
    expect(Array.from(ico.slice(-1))).toEqual([6]);
    expect(() => buildIco([])).toThrow();
    expect(() => buildIco([{ size: 300, png: new Uint8Array(1) }])).toThrow();
  });
});

describe('crop math', () => {
  it('centres an aspect-ratio rectangle', () => {
    expect(centeredRect(1000, 500, 1)).toEqual({ x: 250, y: 0, w: 500, h: 500 });
    expect(centeredRect(400, 1000, 16 / 9)).toEqual({ x: 0, y: 388, w: 400, h: 225 });
    expect(centeredRect(300, 200, null)).toEqual({ x: 0, y: 0, w: 300, h: 200 });
  });

  it('moves within bounds', () => {
    expect(dragRect({ x: 10, y: 10, w: 100, h: 100 }, 'move', 1000, -50, 500, 500, null)).toEqual({ x: 400, y: 0, w: 100, h: 100 });
  });

  it('resizes from corners and edges, keeping the opposite side fixed', () => {
    const r = dragRect({ x: 100, y: 100, w: 200, h: 200 }, 'se', 50, 20, 1000, 1000, null);
    expect(r).toEqual({ x: 100, y: 100, w: 250, h: 220 });
    const nw = dragRect({ x: 100, y: 100, w: 200, h: 200 }, 'nw', -50, -500, 1000, 1000, null);
    expect(nw).toEqual({ x: 50, y: 0, w: 250, h: 300 });
  });

  it('keeps the aspect ratio and stays inside the image', () => {
    const r = dragRect({ x: 0, y: 0, w: 100, h: 100 }, 'se', 400, 50, 300, 1000, 1);
    expect(r.w).toBeCloseTo(r.h, 6);
    expect(r.x + r.w).toBeLessThanOrEqual(300);
    const e = dragRect({ x: 100, y: 100, w: 160, h: 90 }, 'e', 160, 0, 2000, 2000, 16 / 9);
    expect(e.w / e.h).toBeCloseTo(16 / 9, 6);
  });

  it('normalises to whole pixels inside the image', () => {
    expect(normalize({ x: -5.4, y: 10.6, w: 2000, h: 50.2 }, 800, 600)).toEqual({ x: 0, y: 11, w: 800, h: 50 });
  });
});
