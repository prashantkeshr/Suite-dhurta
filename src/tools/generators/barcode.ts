/** Barcode formats offered by the generator and GS1 check-digit helpers. */

export type BarcodeFormat = 'CODE128' | 'EAN13' | 'EAN8' | 'UPC' | 'CODE39' | 'ITF14' | 'codabar';

export const FORMATS: { value: BarcodeFormat; label: string; hint: string; example: string; gs1Digits?: number }[] = [
  { value: 'CODE128', label: 'Code 128', hint: 'Any letters, digits and symbols (ASCII). Common for shipping and inventory labels.', example: 'DHURTA-2026-001' },
  { value: 'EAN13', label: 'EAN-13', hint: '12 digits (the check digit is added) or 13 digits. Retail products outside North America.', example: '890123456789', gs1Digits: 13 },
  { value: 'EAN8', label: 'EAN-8', hint: '7 digits (check digit added) or 8. Small retail packages.', example: '9638507', gs1Digits: 8 },
  { value: 'UPC', label: 'UPC-A', hint: '11 digits (check digit added) or 12. Retail products in North America.', example: '03600029145', gs1Digits: 12 },
  { value: 'CODE39', label: 'Code 39', hint: 'Capital letters A–Z, digits and - . $ / + % and space. Industrial and ID badges.', example: 'SUITE 39' },
  { value: 'ITF14', label: 'ITF-14', hint: '13 digits (check digit added) or 14. Outer cartons.', example: '1540014128876', gs1Digits: 14 },
  { value: 'codabar', label: 'Codabar', hint: 'Digits and - $ : / . +, optionally wrapped in A–D start/stop letters. Libraries and blood banks.', example: 'A40156B' },
];

/** GS1 mod-10 check digit for the given digits (without the check digit). */
export function gs1CheckDigit(digits: string): number {
  let sum = 0;
  for (let i = 0; i < digits.length; i++) {
    const d = digits.charCodeAt(digits.length - 1 - i) - 48;
    sum += d * (i % 2 === 0 ? 3 : 1);
  }
  return (10 - (sum % 10)) % 10;
}

/**
 * Validate a GS1 number (EAN-13/8, UPC-A, ITF-14). Returns the full number with
 * its check digit, or an error explaining what is wrong.
 */
export function completeGs1(value: string, total: number): { full: string } | { error: string } {
  const v = value.replace(/\s/g, '');
  if (!/^\d+$/.test(v)) return { error: 'Use digits only.' };
  if (v.length === total - 1) return { full: v + gs1CheckDigit(v) };
  if (v.length === total) {
    const expected = gs1CheckDigit(v.slice(0, -1));
    return Number(v.at(-1)) === expected ? { full: v } : { error: `The check digit should be ${expected}, not ${v.at(-1)}.` };
  }
  return { error: `Enter ${total - 1} digits (the check digit is calculated) or all ${total}.` };
}
