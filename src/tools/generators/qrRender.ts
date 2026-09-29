/**
 * Branded QR renderer. The `qrcode` library only computes the module matrix;
 * drawing is done here so dots, finder "eyes", colours, logo and frame can be
 * styled. Output is a self-contained SVG string (the logo is embedded as a
 * data URL), which is also rasterised for PNG export and the scan check.
 */
import QRCode from 'qrcode';

export type Ecc = 'L' | 'M' | 'Q' | 'H';
export type DotStyle = 'square' | 'rounded' | 'dots' | 'fluid';
export type EyeStyle = 'square' | 'rounded' | 'circle' | 'leaf';

export interface QrDesign {
  ecc: Ecc;
  /** Quiet zone in modules (4 is the standard). */
  margin: number;
  dotStyle: DotStyle;
  eyeStyle: EyeStyle;
  fg: string;
  bg: string;
  transparent: boolean;
  gradient: boolean;
  fg2: string;
  /** Finder colour; empty string = same as the dots. */
  eyeColor: string;
  /** Logo as a data URL (embedded in the SVG). */
  logo?: string;
  /** Logo width as a fraction of the symbol width (0.1 – 0.3). */
  logoSize: number;
  /** Clear the modules behind the logo and draw a background plate. */
  logoPlate: boolean;
  frame: 'none' | 'caption';
  caption: string;
}

export const DEFAULT_DESIGN: QrDesign = {
  ecc: 'M',
  margin: 4,
  dotStyle: 'square',
  eyeStyle: 'square',
  fg: '#000000',
  bg: '#ffffff',
  transparent: false,
  gradient: false,
  fg2: '#4f46e5',
  eyeColor: '',
  logoSize: 0.22,
  logoPlate: true,
  frame: 'none',
  caption: 'SCAN ME',
};

export interface Matrix {
  n: number;
  version: number;
  get: (r: number, c: number) => boolean;
}

export function qrMatrix(text: string, ecc: Ecc): Matrix {
  const q = QRCode.create(text, { errorCorrectionLevel: ecc });
  const n = q.modules.size;
  const data = q.modules.data;
  return { n, version: q.version, get: (r, c) => r >= 0 && c >= 0 && r < n && c < n && data[r * n + c] === 1 };
}

const isFinder = (r: number, c: number, n: number) => (r < 7 && c < 7) || (r < 7 && c >= n - 7) || (r >= n - 7 && c < 7);

const f = (v: number) => +v.toFixed(3);

/** Rounded rectangle path with per-corner radii [tl, tr, br, bl]. */
export function rr(x: number, y: number, w: number, h: number, [tl, tr, br, bl]: [number, number, number, number]): string {
  const p = [`M${f(x + tl)} ${f(y)}`, `H${f(x + w - tr)}`];
  if (tr) p.push(`A${f(tr)} ${f(tr)} 0 0 1 ${f(x + w)} ${f(y + tr)}`);
  p.push(`V${f(y + h - br)}`);
  if (br) p.push(`A${f(br)} ${f(br)} 0 0 1 ${f(x + w - br)} ${f(y + h)}`);
  p.push(`H${f(x + bl)}`);
  if (bl) p.push(`A${f(bl)} ${f(bl)} 0 0 1 ${f(x)} ${f(y + h - bl)}`);
  p.push(`V${f(y + tl)}`);
  if (tl) p.push(`A${f(tl)} ${f(tl)} 0 0 1 ${f(x + tl)} ${f(y)}`);
  return p.join('') + 'Z';
}

const circle = (cx: number, cy: number, r: number) => `M${f(cx - r)} ${f(cy)}a${f(r)} ${f(r)} 0 1 0 ${f(2 * r)} 0a${f(r)} ${f(r)} 0 1 0 ${f(-2 * r)} 0Z`;

function eyePath(style: EyeStyle, x: number, y: number): string {
  switch (style) {
    case 'circle':
      return circle(x + 3.5, y + 3.5, 3.5) + circle(x + 3.5, y + 3.5, 2.5) + circle(x + 3.5, y + 3.5, 1.5);
    case 'rounded':
      return rr(x, y, 7, 7, [2, 2, 2, 2]) + rr(x + 1, y + 1, 5, 5, [1.4, 1.4, 1.4, 1.4]) + rr(x + 2, y + 2, 3, 3, [0.9, 0.9, 0.9, 0.9]);
    case 'leaf':
      return rr(x, y, 7, 7, [2.8, 0, 2.8, 0]) + rr(x + 1, y + 1, 5, 5, [2, 0, 2, 0]) + rr(x + 2, y + 2, 3, 3, [1.2, 0, 1.2, 0]);
    default:
      return rr(x, y, 7, 7, [0, 0, 0, 0]) + rr(x + 1, y + 1, 5, 5, [0, 0, 0, 0]) + rr(x + 2, y + 2, 3, 3, [0, 0, 0, 0]);
  }
}

const xmlEsc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

export interface RenderInfo {
  svg: string;
  version: number;
  modules: number;
  /** Share of data modules hidden behind the logo (0–1). */
  logoCoverage: number;
}

export function renderQrSvg(text: string, d: QrDesign, pixelSize = 512): RenderInfo {
  const ecc: Ecc = d.logo ? 'H' : d.ecc;
  const m = qrMatrix(text, ecc);
  const { n } = m;
  const q = Math.max(0, Math.round(d.margin));
  const W = n + 2 * q;
  const band = d.frame === 'caption' ? Math.max(5, W * 0.17) : 0;
  const H = W + band;

  // Logo box in module coordinates (centred on the symbol).
  const logoW = d.logo ? Math.min(0.3, Math.max(0.1, d.logoSize)) * n : 0;
  const lx = q + (n - logoW) / 2;
  const pad = d.logoPlate ? 0.6 : 0;
  const inLogo = (r: number, c: number) => !!d.logo && c + 1 > lx - pad && c < lx + logoW + pad && r + 1 > lx - pad && r < lx + logoW + pad;

  let dots = '';
  let data = 0;
  let hidden = 0;
  const e = 0.02; // tiny overlap hides anti-aliasing seams between touching modules
  for (let r = 0; r < n; r++) {
    for (let c = 0; c < n; c++) {
      if (isFinder(r, c, n) || !m.get(r, c)) continue;
      data++;
      if (inLogo(r + q, c + q)) {
        hidden++;
        if (d.logoPlate) continue; // cleared; without a plate the logo is simply drawn on top
      }
      const x = c + q;
      const y = r + q;
      switch (d.dotStyle) {
        case 'dots':
          dots += circle(x + 0.5, y + 0.5, 0.46);
          break;
        case 'rounded':
          dots += rr(x + 0.06, y + 0.06, 0.88, 0.88, [0.3, 0.3, 0.3, 0.3]);
          break;
        case 'fluid': {
          const up = m.get(r - 1, c) && !isFinder(r - 1, c, n);
          const dn = m.get(r + 1, c) && !isFinder(r + 1, c, n);
          const lf = m.get(r, c - 1) && !isFinder(r, c - 1, n);
          const rt = m.get(r, c + 1) && !isFinder(r, c + 1, n);
          const R = 0.5;
          dots += rr(x - (lf ? e : 0), y - (up ? e : 0), 1 + (lf ? e : 0) + (rt ? e : 0), 1 + (up ? e : 0) + (dn ? e : 0), [!up && !lf ? R : 0, !up && !rt ? R : 0, !dn && !rt ? R : 0, !dn && !lf ? R : 0]);
          break;
        }
        default:
          dots += `M${f(x - e)} ${f(y - e)}h${f(1 + 2 * e)}v${f(1 + 2 * e)}h${f(-1 - 2 * e)}Z`;
      }
    }
  }

  const eyes = [
    [q, q],
    [q + n - 7, q],
    [q, q + n - 7],
  ]
    .map(([x, y]) => eyePath(d.eyeStyle, x, y))
    .join('');

  const dotFill = d.gradient ? 'url(#qg)' : d.fg;
  const eyeFill = d.eyeColor || dotFill;
  const parts: string[] = [];
  parts.push(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${f(W)} ${f(H)}" width="${pixelSize}" height="${Math.round((pixelSize * H) / W)}" shape-rendering="${d.dotStyle === 'square' && d.eyeStyle === 'square' ? 'crispEdges' : 'geometricPrecision'}">`);
  if (d.gradient) parts.push(`<defs><linearGradient id="qg" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="${xmlEsc(d.fg)}"/><stop offset="1" stop-color="${xmlEsc(d.fg2)}"/></linearGradient></defs>`);
  if (!d.transparent) parts.push(`<rect width="${f(W)}" height="${f(H)}" rx="${band ? 1.5 : 0}" fill="${xmlEsc(d.bg)}"/>`);
  parts.push(`<path d="${dots}" fill="${xmlEsc(dotFill)}"/>`);
  parts.push(`<path d="${eyes}" fill="${xmlEsc(eyeFill)}" fill-rule="evenodd"/>`);
  if (d.logo) {
    if (d.logoPlate) parts.push(`<rect x="${f(lx - pad)}" y="${f(lx - pad)}" width="${f(logoW + 2 * pad)}" height="${f(logoW + 2 * pad)}" rx="${f(logoW * 0.18)}" fill="${xmlEsc(d.transparent ? '#ffffff' : d.bg)}"/>`);
    parts.push(`<image href="${xmlEsc(d.logo)}" x="${f(lx)}" y="${f(lx)}" width="${f(logoW)}" height="${f(logoW)}" preserveAspectRatio="xMidYMid meet"/>`);
  }
  if (band) {
    const by = W - q * 0.35;
    parts.push(`<rect x="${f(q * 0.5)}" y="${f(by)}" width="${f(W - q)}" height="${f(band + q * 0.35 - q * 0.5)}" rx="1.2" fill="${xmlEsc(d.gradient ? 'url(#qg)' : d.eyeColor || d.fg)}"/>`);
    parts.push(`<text x="${f(W / 2)}" y="${f(by + (band + q * 0.35 - q * 0.5) / 2)}" text-anchor="middle" dominant-baseline="central" font-family="Inter, 'Segoe UI', Roboto, Arial, sans-serif" font-weight="700" font-size="${f(band * 0.46)}" letter-spacing="${f(band * 0.03)}" fill="${xmlEsc(d.transparent ? '#ffffff' : d.bg)}">${xmlEsc(d.caption.slice(0, 40))}</text>`);
  }
  parts.push('</svg>');
  return { svg: parts.join(''), version: m.version, modules: n, logoCoverage: data ? hidden / data : 0 };
}

/* ---------- Colour checks ---------- */

function luminance(hex: string): number {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex.trim());
  if (!m) return 0;
  const [r, g, b] = [0, 2, 4].map((i) => parseInt(m[1].slice(i, i + 2), 16) / 255).map((v) => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4));
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

export function contrastRatio(a: string, b: string): number {
  const [x, y] = [luminance(a), luminance(b)].sort((p, q) => q - p);
  return (x + 0.05) / (y + 0.05);
}

/** Human-readable design warnings (independent of the pixel scan check). */
export function designWarnings(d: QrDesign, info: RenderInfo): string[] {
  const w: string[] = [];
  const bg = d.transparent ? '#ffffff' : d.bg;
  const darkest = d.gradient ? (luminance(d.fg) > luminance(d.fg2) ? d.fg : d.fg2) : d.fg;
  const lightestFg = d.gradient ? (luminance(d.fg) > luminance(d.fg2) ? d.fg2 : d.fg) : d.fg;
  const worst = Math.min(contrastRatio(darkest, bg), contrastRatio(lightestFg, bg));
  if (worst < 3) w.push(`Low contrast between the code and background (${worst.toFixed(1)}:1). Aim for at least 4:1.`);
  if (luminance(lightestFg) > luminance(bg)) w.push('Light code on a dark background (inverted) is not supported by some scanner apps.');
  if (d.transparent) w.push('Transparent background: place the code on a plain light surface when you use it.');
  if (info.logoCoverage > 0.2) w.push(`The logo hides ${Math.round(info.logoCoverage * 100)}% of the data — close to the limit error correction can repair. Make the logo smaller.`);
  return w;
}
