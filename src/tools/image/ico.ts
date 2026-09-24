/**
 * Build a .ico file that embeds PNG images (supported by every browser and by
 * Windows Vista+). Each entry must be a square PNG of at most 256×256.
 */
export function buildIco(images: { size: number; png: Uint8Array }[]): Uint8Array {
  if (images.length === 0) throw new Error('ICO needs at least one image');
  const sorted = [...images].sort((a, b) => a.size - b.size);
  const headerSize = 6 + 16 * sorted.length;
  const total = headerSize + sorted.reduce((a, i) => a + i.png.length, 0);
  const out = new Uint8Array(total);
  const view = new DataView(out.buffer);
  view.setUint16(0, 0, true); // reserved
  view.setUint16(2, 1, true); // type: icon
  view.setUint16(4, sorted.length, true);
  let offset = headerSize;
  sorted.forEach((img, i) => {
    if (img.size < 1 || img.size > 256) throw new Error(`ICO sizes must be 1–256 px (got ${img.size})`);
    const e = 6 + i * 16;
    out[e] = img.size === 256 ? 0 : img.size; // width (0 means 256)
    out[e + 1] = img.size === 256 ? 0 : img.size; // height
    out[e + 2] = 0; // palette colours
    out[e + 3] = 0; // reserved
    view.setUint16(e + 4, 1, true); // colour planes
    view.setUint16(e + 6, 32, true); // bits per pixel
    view.setUint32(e + 8, img.png.length, true);
    view.setUint32(e + 12, offset, true);
    out.set(img.png, offset);
    offset += img.png.length;
  });
  return out;
}
