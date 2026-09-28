/**
 * Generate every brand asset from the source files in logo/.
 * Run after changing the logo:  node scripts/brand.mjs
 *
 * Sources (logo/):
 *   Suite.dhurta favicon.png      dark app tile drawn for small sizes → favicon.ico, favicon-16/32
 *   Suitelogomain.png             largest dark app tile → PWA / Apple / maskable icons
 *   Suite.dhurta banner.png       horizontal logo, dark text, transparent → header (light theme)
 *   Suite.dhurta temp. light/dark badge templates → footer
 *   suite.dhurta main light/dark  square marks → About page
 *
 * Output goes to public/ (served as-is) — commit the results.
 */
import sharp from 'sharp';
import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('..', import.meta.url));
const src = (f) => join(root, 'logo', f);
const pub = (f) => join(root, 'public', f);
mkdirSync(pub('brand'), { recursive: true });

/** Brand navy sampled from the app tile background. */
const NAVY = { r: 3, g: 12, b: 37, alpha: 1 };
const CLEAR = { r: 0, g: 0, b: 0, alpha: 0 };

/** Pad a (nearly square) image to an exact square without distortion. */
async function squareBuffer(file) {
  const img = sharp(file).ensureAlpha();
  const { width, height } = await img.metadata();
  const size = Math.max(width, height);
  return img
    .extend({ top: Math.floor((size - height) / 2), bottom: Math.ceil((size - height) / 2), left: Math.floor((size - width) / 2), right: Math.ceil((size - width) / 2), background: CLEAR })
    .png()
    .toBuffer();
}

/** Square icon: the tile scaled to `scale` of the canvas, on a transparent or navy background. */
async function icon(tile, size, { scale = 1, background = CLEAR } = {}) {
  const inner = Math.round(size * scale);
  let scaled = await sharp(tile).resize(inner, inner, { kernel: 'lanczos3' }).png().toBuffer();
  // Oversized (scale > 1): crop the centre so the tile's own rounded corners fall outside the canvas.
  if (inner > size) {
    const off = Math.floor((inner - size) / 2);
    scaled = await sharp(scaled).extract({ left: off, top: off, width: size, height: size }).png().toBuffer();
  }
  return sharp({ create: { width: size, height: size, channels: 4, background } })
    .composite([{ input: scaled, gravity: 'centre' }])
    .png({ compressionLevel: 9 })
    .toBuffer();
}

/** .ico containing PNG images (supported by all current browsers and Windows). */
function buildIco(images) {
  const header = Buffer.alloc(6 + 16 * images.length);
  header.writeUInt16LE(0, 0);
  header.writeUInt16LE(1, 2);
  header.writeUInt16LE(images.length, 4);
  let offset = header.length;
  images.forEach(({ size, png }, i) => {
    const e = 6 + i * 16;
    header[e] = size >= 256 ? 0 : size;
    header[e + 1] = size >= 256 ? 0 : size;
    header.writeUInt16LE(1, e + 4);
    header.writeUInt16LE(32, e + 6);
    header.writeUInt32LE(png.length, e + 8);
    header.writeUInt32LE(offset, e + 12);
    offset += png.length;
  });
  return Buffer.concat([header, ...images.map((i) => i.png)]);
}

/**
 * Dark-theme version of a logo drawn for light backgrounds: near-black, low-
 * saturation pixels (the wordmark and divider) become off-white; the coloured
 * mark and sparkle are left untouched.
 */
async function lightTextVariant(file) {
  const { data, info } = await sharp(file).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  for (let i = 0; i < data.length; i += 4) {
    const [r, g, b] = [data[i], data[i + 1], data[i + 2]];
    // Wordmark navy (~#050a29) and the dark divider. The gradient S and the
    // sparkle are blue/purple/teal with blue >= 190, so they are never touched.
    if (r < 64 && g < 64 && b < 100) {
      data[i] = 241;
      data[i + 1] = 245;
      data[i + 2] = 249;
    }
  }
  return sharp(data, { raw: info }).png({ compressionLevel: 9 }).toBuffer();
}

const trim = (buf) => sharp(buf).trim({ threshold: 1 }).png({ compressionLevel: 9 }).toBuffer();

/* ---------- Favicons ---------- */

const favTile = await squareBuffer(src('Suite.dhurta favicon.png'));
const fav = {};
for (const s of [16, 32, 48]) fav[s] = await icon(favTile, s);
writeFileSync(pub('favicon.ico'), buildIco([16, 32, 48].map((size) => ({ size, png: fav[size] }))));
writeFileSync(pub('favicon-16.png'), fav[16]);
writeFileSync(pub('favicon-32.png'), fav[32]);

/* ---------- App / PWA icons ---------- */

const mainTile = await squareBuffer(src('Suitelogomain.png'));
/**
 * The tile's plain navy interior (outer rounded rim cropped away). Placed on a
 * navy square it gives a seamless full-bleed icon for iOS and Android masks.
 */
const innerTile = await (async () => {
  const { width } = await sharp(mainTile).metadata();
  const inset = Math.round(width * 0.15); // clears the tile's rounded corners; the glyph starts ~17% in
  return sharp(mainTile).extract({ left: inset, top: inset, width: width - 2 * inset, height: width - 2 * inset }).png().toBuffer();
})();
// "any" icons keep the rounded tile with transparent corners.
writeFileSync(pub('icon-192.png'), await icon(mainTile, 192));
writeFileSync(pub('icon-512.png'), await icon(mainTile, 512));
// iOS rounds icons itself and fills transparency with black: use a full-bleed navy square.
// Fill with the crop's own edge colour so the square boundary is invisible.
const TILE_BG = await (async () => {
  const { data, info } = await sharp(innerTile).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const at = (x, y) => (y * info.width + x) * 4;
  const pts = [at(2, 2), at(info.width - 3, 2), at(2, info.height - 3), at(info.width - 3, info.height - 3)];
  const avg = (k) => Math.round(pts.reduce((sum, i) => sum + data[i + k], 0) / pts.length);
  return { r: avg(0), g: avg(1), b: avg(2), alpha: 1 };
})();
writeFileSync(pub('icon-180.png'), await icon(innerTile, 180, { scale: 0.78, background: TILE_BG }));
// Android "maskable": full-bleed navy, artwork kept inside the 80% safe zone.
writeFileSync(pub('icon-maskable-192.png'), await icon(innerTile, 192, { scale: 0.64, background: TILE_BG }));
writeFileSync(pub('icon-maskable-512.png'), await icon(innerTile, 512, { scale: 0.64, background: TILE_BG }));

/* ---------- Logos for the interface ---------- */

const bannerLight = await trim(await sharp(src('Suite.dhurta banner.png')).ensureAlpha().png().toBuffer());
writeFileSync(pub('brand/logo-light.png'), bannerLight);
writeFileSync(pub('brand/logo-dark.png'), await lightTextVariant(bannerLight));
writeFileSync(pub('brand/badge-light.png'), await trim(await sharp(src('Suite.dhurta temp. light.png')).png().toBuffer()));
writeFileSync(pub('brand/badge-dark.png'), await trim(await sharp(src('Suite.dhurta temp.  dark.png')).png().toBuffer()));
writeFileSync(pub('brand/mark-light.png'), await icon(await squareBuffer(src('suite.dhurta main light.png')), 160));
writeFileSync(pub('brand/mark-dark.png'), await icon(await squareBuffer(src('suite.dhurta main dark.png')), 160));

/* ---------- Social share image (1200 × 630) ---------- */

const W = 1200;
const H = 630;
const logo = await sharp(await lightTextVariant(bannerLight)).resize({ height: 150 }).png().toBuffer();
const logoMeta = await sharp(logo).metadata();
const chips = ['100% in your browser', 'No upload', 'No sign-up', 'Free'];
let cx = 80;
const chipSvg = chips
  .map((t) => {
    const w = Math.round(t.length * 15.2 + 44);
    const s = `<rect x="${cx}" y="468" width="${w}" height="54" rx="27" fill="#2563eb" fill-opacity="0.18" stroke="#6091ff" stroke-opacity="0.55" stroke-width="2"/><text x="${cx + w / 2}" y="503" text-anchor="middle" font-size="26" font-weight="600" fill="#bfdbfe">${t}</text>`;
    cx += w + 16;
    return s;
  })
  .join('');
const overlay = Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}">
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#030c25"/><stop offset="1" stop-color="#0b1a44"/></linearGradient>
    <radialGradient id="glow" cx="0.85" cy="0.1" r="0.6"><stop offset="0" stop-color="#7c3aed" stop-opacity="0.35"/><stop offset="1" stop-color="#7c3aed" stop-opacity="0"/></radialGradient>
    <radialGradient id="glow2" cx="0.1" cy="1" r="0.6"><stop offset="0" stop-color="#14b8a6" stop-opacity="0.22"/><stop offset="1" stop-color="#14b8a6" stop-opacity="0"/></radialGradient>
  </defs>
  <rect width="100%" height="100%" fill="url(#bg)"/><rect width="100%" height="100%" fill="url(#glow)"/><rect width="100%" height="100%" fill="url(#glow2)"/>
  <g font-family="Segoe UI, Inter, DejaVu Sans, Arial, sans-serif">
    <text x="80" y="330" font-size="58" font-weight="700" fill="#f1f5f9">Free online tools that</text>
    <text x="80" y="400" font-size="58" font-weight="700" fill="#f1f5f9">never upload your files.</text>
    <text x="${W - 80}" y="585" text-anchor="end" font-size="26" fill="#94a3b8">suite.dhurta.com</text>
    ${chipSvg}
  </g>
</svg>`);
await sharp(overlay)
  .composite([{ input: logo, left: 72, top: 64 }])
  .jpeg({ quality: 86, mozjpeg: true })
  .toFile(pub('og.jpg'));

/* ---------- Remove the old placeholder logo ---------- */
rmSync(pub('favicon.svg'), { force: true });

console.log('brand assets written:', {
  favicon: 'favicon.ico (16/32/48), favicon-16.png, favicon-32.png',
  icons: 'icon-180 (apple), icon-192, icon-512, icon-maskable-192/512',
  interface: 'brand/logo-light|dark, badge-light|dark, mark-light|dark',
  share: `og.jpg ${W}x${H} (logo ${logoMeta.width}x${logoMeta.height})`,
});
