import { describe, expect, it } from 'vitest';
import { computeInvoice, lineTotal, amountInWords, type Invoice } from './invoice';

const base = (interState: boolean): Invoice => ({
  number: 'INV-1', date: '2026-10-09',
  seller: { name: 'A', address: '', gstin: '', email: '', phone: '', state: 'Maharashtra' },
  buyer: { name: 'B', address: '', gstin: '', email: '', phone: '', state: interState ? 'Delhi' : 'Maharashtra' },
  items: [
    { description: 'Widget', hsn: '1234', qty: 2, rate: 1000, gstPercent: 18, discount: 0 },
    { description: 'Gadget', hsn: '5678', qty: 1, rate: 500, gstPercent: 5, discount: 50 },
  ],
  interState, notes: '', currency: 'INR',
});

describe('invoice calculations', () => {
  it('computes line totals with discount and GST', () => {
    expect(lineTotal({ description: '', hsn: '', qty: 2, rate: 1000, gstPercent: 18, discount: 0 })).toEqual({ taxable: 2000, gst: 360, total: 2360 });
    expect(lineTotal({ description: '', hsn: '', qty: 1, rate: 500, gstPercent: 5, discount: 50 })).toEqual({ taxable: 450, gst: 22.5, total: 472.5 });
  });

  it('splits intra-state GST into CGST + SGST', () => {
    const t = computeInvoice(base(false));
    expect(t.taxable).toBe(2450);
    expect(t.totalGst).toBe(382.5);
    expect(t.cgst).toBe(191.25);
    expect(t.sgst).toBe(191.25);
    expect(t.igst).toBe(0);
    expect(t.byRate).toHaveLength(2);
    expect(t.byRate.find((r) => r.rate === 18)).toMatchObject({ taxable: 2000, cgst: 180, sgst: 180 });
  });

  it('uses IGST for inter-state', () => {
    const t = computeInvoice(base(true));
    expect(t.igst).toBe(382.5);
    expect(t.cgst).toBe(0);
    expect(t.byRate.find((r) => r.rate === 5)).toMatchObject({ igst: 22.5 });
  });

  it('rounds the grand total and records the round-off', () => {
    const t = computeInvoice(base(false));
    // 2450 + 382.5 = 2832.5 → 2833 (round off +0.5)
    expect(t.grandTotal).toBe(2833);
    expect(t.roundOff).toBe(0.5);
  });

  it('writes Indian amounts in words', () => {
    expect(amountInWords(2833)).toBe('Two Thousand Eight Hundred Thirty Three Rupees only');
    expect(amountInWords(1234.5)).toBe('One Thousand Two Hundred Thirty Four Rupees and Fifty Paise');
    expect(amountInWords(10000000)).toBe('One Crore Rupees only');
    expect(amountInWords(0)).toBe('Zero Rupees only');
  });
});
