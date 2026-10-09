/** GST invoice calculations (pure, unit-tested). Amounts are in rupees. */

export interface LineItem {
  description: string;
  hsn: string;
  qty: number;
  rate: number;
  gstPercent: number;
  /** Per-line discount in rupees (applied before GST). */
  discount: number;
}

export interface InvoiceParty {
  name: string;
  address: string;
  gstin: string;
  email: string;
  phone: string;
  state: string;
}

export interface Invoice {
  number: string;
  date: string;
  seller: InvoiceParty;
  buyer: InvoiceParty;
  items: LineItem[];
  /** Intra-state → CGST + SGST; inter-state → IGST. */
  interState: boolean;
  notes: string;
  currency: string;
}

export interface LineTotal {
  taxable: number;
  gst: number;
  total: number;
}

export interface InvoiceTotals {
  lines: LineTotal[];
  subtotal: number;
  totalDiscount: number;
  taxable: number;
  /** GST grouped by rate, for the tax summary table. */
  byRate: { rate: number; taxable: number; cgst: number; sgst: number; igst: number }[];
  cgst: number;
  sgst: number;
  igst: number;
  totalGst: number;
  grandTotal: number;
  roundOff: number;
}

const round2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;

export function lineTotal(item: LineItem): LineTotal {
  const gross = (item.qty || 0) * (item.rate || 0);
  const taxable = Math.max(0, gross - (item.discount || 0));
  const gst = round2((taxable * (item.gstPercent || 0)) / 100);
  return { taxable: round2(taxable), gst, total: round2(taxable + gst) };
}

export function computeInvoice(inv: Invoice): InvoiceTotals {
  const lines = inv.items.map(lineTotal);
  const subtotal = round2(inv.items.reduce((a, it) => a + (it.qty || 0) * (it.rate || 0), 0));
  const totalDiscount = round2(inv.items.reduce((a, it) => a + (it.discount || 0), 0));
  const taxable = round2(lines.reduce((a, l) => a + l.taxable, 0));

  const rateMap = new Map<number, { taxable: number; gst: number }>();
  inv.items.forEach((it, i) => {
    const r = it.gstPercent || 0;
    const e = rateMap.get(r) ?? { taxable: 0, gst: 0 };
    e.taxable += lines[i].taxable;
    e.gst += lines[i].gst;
    rateMap.set(r, e);
  });

  const byRate = [...rateMap.entries()]
    .filter(([r]) => r > 0)
    .sort((a, b) => a[0] - b[0])
    .map(([rate, e]) => ({
      rate,
      taxable: round2(e.taxable),
      cgst: inv.interState ? 0 : round2(e.gst / 2),
      sgst: inv.interState ? 0 : round2(e.gst / 2),
      igst: inv.interState ? round2(e.gst) : 0,
    }));

  const totalGst = round2(lines.reduce((a, l) => a + l.gst, 0));
  const cgst = round2(byRate.reduce((a, r) => a + r.cgst, 0));
  const sgst = round2(byRate.reduce((a, r) => a + r.sgst, 0));
  const igst = round2(byRate.reduce((a, r) => a + r.igst, 0));

  const beforeRound = taxable + totalGst;
  const grandTotal = Math.round(beforeRound);
  const roundOff = round2(grandTotal - beforeRound);

  return { lines, subtotal, totalDiscount, taxable, byRate, cgst, sgst, igst, totalGst, grandTotal, roundOff };
}

/** Indian-English words for a rupee amount, e.g. 1234.5 → "One Thousand Two Hundred Thirty Four Rupees and Fifty Paise". */
export function amountInWords(amount: number): string {
  const rupees = Math.floor(amount);
  const paise = Math.round((amount - rupees) * 100);
  const ONES = ['', 'One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight', 'Nine', 'Ten', 'Eleven', 'Twelve', 'Thirteen', 'Fourteen', 'Fifteen', 'Sixteen', 'Seventeen', 'Eighteen', 'Nineteen'];
  const TENS = ['', '', 'Twenty', 'Thirty', 'Forty', 'Fifty', 'Sixty', 'Seventy', 'Eighty', 'Ninety'];
  const two = (n: number): string => (n < 20 ? ONES[n] : `${TENS[Math.floor(n / 10)]}${n % 10 ? ' ' + ONES[n % 10] : ''}`);
  const three = (n: number): string => (n >= 100 ? `${ONES[Math.floor(n / 100)]} Hundred${n % 100 ? ' ' + two(n % 100) : ''}` : two(n));
  const words = (n: number): string => {
    if (n === 0) return 'Zero';
    const crore = Math.floor(n / 1e7);
    const lakh = Math.floor((n % 1e7) / 1e5);
    const thousand = Math.floor((n % 1e5) / 1e3);
    const rest = n % 1e3;
    return [crore && `${three(crore)} Crore`, lakh && `${three(lakh)} Lakh`, thousand && `${three(thousand)} Thousand`, rest && three(rest)].filter(Boolean).join(' ');
  };
  const r = `${words(rupees)} Rupee${rupees === 1 ? '' : 's'}`;
  return paise > 0 ? `${r} and ${two(paise)} Paise` : `${r} only`;
}
