/** CSS gradient and box-shadow builders. */

export interface Stop {
  color: string;
  /** 0–100 */
  at: number;
}

export interface GradientSpec {
  type: 'linear' | 'radial' | 'conic';
  angle: number;
  shape: 'circle' | 'ellipse';
  stops: Stop[];
}

export function gradientCss(g: GradientSpec): string {
  const stops = [...g.stops].sort((a, b) => a.at - b.at).map((s) => `${s.color} ${Math.round(s.at)}%`).join(', ');
  if (g.type === 'radial') return `radial-gradient(${g.shape}, ${stops})`;
  if (g.type === 'conic') return `conic-gradient(from ${Math.round(g.angle)}deg, ${stops})`;
  return `linear-gradient(${Math.round(g.angle)}deg, ${stops})`;
}

export interface ShadowLayer {
  x: number;
  y: number;
  blur: number;
  spread: number;
  color: string;
  /** 0–100 */
  opacity: number;
  inset: boolean;
}

export function hexToRgba(hex: string, opacity: number): string {
  const m = hex.replace('#', '').match(/^([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i);
  if (!m) return hex;
  const a = Math.round(Math.max(0, Math.min(100, opacity))) / 100;
  return `rgba(${parseInt(m[1], 16)}, ${parseInt(m[2], 16)}, ${parseInt(m[3], 16)}, ${a})`;
}

export function shadowCss(layers: ShadowLayer[]): string {
  if (!layers.length) return 'none';
  return layers.map((l) => `${l.inset ? 'inset ' : ''}${l.x}px ${l.y}px ${l.blur}px ${l.spread}px ${hexToRgba(l.color, l.opacity)}`).join(', ');
}
