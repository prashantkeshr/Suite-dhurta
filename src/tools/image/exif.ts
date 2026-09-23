/**
 * Read the EXIF Orientation tag (1–8) from JPEG bytes. Returns 1 when absent
 * or unreadable. Only the APP1 header is inspected, so this is cheap.
 */
export function jpegOrientation(bytes: Uint8Array): number {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  if (view.byteLength < 4 || view.getUint16(0) !== 0xffd8) return 1;
  let offset = 2;
  while (offset + 4 < view.byteLength) {
    const marker = view.getUint16(offset);
    if ((marker & 0xff00) !== 0xff00) return 1;
    const size = view.getUint16(offset + 2);
    if (marker === 0xffe1 && offset + 10 < view.byteLength && view.getUint32(offset + 4) === 0x45786966 /* "Exif" */) {
      const tiff = offset + 10;
      if (tiff + 8 > view.byteLength) return 1;
      const little = view.getUint16(tiff) === 0x4949;
      const ifd = tiff + view.getUint32(tiff + 4, little);
      if (ifd + 2 > view.byteLength) return 1;
      const entries = view.getUint16(ifd, little);
      for (let i = 0; i < entries; i++) {
        const entry = ifd + 2 + i * 12;
        if (entry + 10 > view.byteLength) return 1;
        if (view.getUint16(entry, little) === 0x0112) {
          const v = view.getUint16(entry + 8, little);
          return v >= 1 && v <= 8 ? v : 1;
        }
      }
      return 1;
    }
    if (marker === 0xffda) return 1; // start of scan: no more metadata
    offset += 2 + size;
  }
  return 1;
}
