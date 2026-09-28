import { clsx } from 'clsx';
import { APP } from '@/app/config';

/**
 * Brand images, generated from logo/ by scripts/brand.mjs into public/brand/.
 * Both theme versions are rendered and CSS shows the right one, so switching
 * light/dark swaps the logo instantly without a re-download.
 */
type Kind = 'logo' | 'badge' | 'mark';

const FILES: Record<Kind, { light: string; dark: string; ratio: number }> = {
  // Horizontal lockup "S | Suite by Dhurta.org" (452 × 160)
  logo: { light: 'brand/logo-light.png', dark: 'brand/logo-dark.png', ratio: 452 / 160 },
  // Badge template with its own background (≈ 3.7 : 1)
  badge: { light: 'brand/badge-light.png', dark: 'brand/badge-dark.png', ratio: 351 / 95 },
  // Square app mark
  mark: { light: 'brand/mark-light.png', dark: 'brand/mark-dark.png', ratio: 1 },
};

export function Brand({ kind = 'logo', height, className, alt = APP.name }: { kind?: Kind; height: number; className?: string; alt?: string }) {
  const f = FILES[kind];
  const base = import.meta.env.BASE_URL;
  const width = Math.round(height * f.ratio);
  const common = { width, height, alt, decoding: 'async' as const, draggable: false };
  return (
    <span className={clsx('inline-flex shrink-0', className)} style={{ width, height }}>
      <img src={base + f.light} {...common} className="block dark:hidden" />
      <img src={base + f.dark} {...common} aria-hidden className="hidden dark:block" alt="" />
    </span>
  );
}
