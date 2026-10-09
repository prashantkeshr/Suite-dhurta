/** Draw a GST invoice to a one-page A4 PDF with pdf-lib. */
import { PDFDocument, StandardFonts, rgb, type PDFFont } from 'pdf-lib';
import { computeInvoice, amountInWords, lineTotal, type Invoice } from './invoice';

const money = (n: number) => 'Rs. ' + n.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
// pdf-lib's standard fonts are WinAnsi; drop characters they cannot encode (e.g. ₹, Devanagari).
const safe = (s: string) => (s || '').replace(/[^\x20-\x7e]/g, '');

export async function invoicePdf(inv: Invoice): Promise<Blob> {
  const t = computeInvoice(inv);
  const doc = await PDFDocument.create();
  const page = doc.addPage([595.28, 841.89]); // A4
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const bold = await doc.embedFont(StandardFonts.HelveticaBold);
  const M = 40;
  const W = 595.28;
  const ink = rgb(0.1, 0.12, 0.18);
  const muted = rgb(0.4, 0.43, 0.5);
  const line = rgb(0.8, 0.82, 0.86);
  const accent = rgb(0.012, 0.047, 0.145);
  let y = 801;

  const text = (s: string, x: number, yy: number, size = 9, f: PDFFont = font, color = ink) => page.drawText(safe(s), { x, y: yy, size, font: f, color });
  const right = (s: string, xRight: number, yy: number, size = 9, f: PDFFont = font, color = ink) => text(s, xRight - f.widthOfTextAtSize(safe(s), size), yy, size, f, color);
  const hr = (yy: number, color = line) => page.drawLine({ start: { x: M, y: yy }, end: { x: W - M, y: yy }, thickness: 0.7, color });
  const wrap = (s: string, x: number, yy: number, max: number, size = 9, f: PDFFont = font, color = muted) => {
    for (const ln of safe(s).split('\n')) {
      const words = ln.split(' ');
      let cur = '';
      for (const w of words) {
        if (f.widthOfTextAtSize(cur + ' ' + w, size) > max && cur) {
          text(cur, x, yy, size, f, color);
          yy -= size + 3;
          cur = w;
        } else cur = cur ? cur + ' ' + w : w;
      }
      if (cur) {
        text(cur, x, yy, size, f, color);
        yy -= size + 3;
      }
    }
    return yy;
  };

  // Header
  text('TAX INVOICE', M, y, 18, bold, accent);
  right(`Invoice #${inv.number || '—'}`, W - M, y + 4, 10, bold);
  right(`Date: ${inv.date || '—'}`, W - M, y - 10, 9, font, muted);
  y -= 28;
  hr(y);
  y -= 18;

  // Parties
  const colW = (W - 2 * M) / 2;
  text('FROM', M, y, 8, bold, muted);
  text('BILL TO', M + colW, y, 8, bold, muted);
  y -= 14;
  const party = (p: Invoice['seller'], x: number, yy: number) => {
    text(p.name || '—', x, yy, 11, bold);
    let yc = yy - 14;
    yc = wrap(p.address, x, yc, colW - 10);
    if (p.gstin) { text(`GSTIN: ${p.gstin}`, x, yc, 8.5, font, muted); yc -= 12; }
    if (p.state) { text(`State: ${p.state}`, x, yc, 8.5, font, muted); yc -= 12; }
    if (p.email) { text(p.email, x, yc, 8.5, font, muted); yc -= 12; }
    if (p.phone) { text(p.phone, x, yc, 8.5, font, muted); yc -= 12; }
    return yc;
  };
  const yA = party(inv.seller, M, y);
  const yB = party(inv.buyer, M + colW, y);
  y = Math.min(yA, yB) - 8;
  hr(y);
  y -= 16;

  // Items table
  const cols = inv.interState
    ? [{ h: '#', x: M, w: 18 }, { h: 'Description', x: M + 20, w: 150 }, { h: 'HSN', x: M + 172, w: 40 }, { h: 'Qty', x: M + 300, w: 30, r: true }, { h: 'Rate', x: M + 370, w: 50, r: true }, { h: 'GST%', x: M + 420, w: 35, r: true }, { h: 'Amount', x: W - M, w: 60, r: true }]
    : [{ h: '#', x: M, w: 18 }, { h: 'Description', x: M + 20, w: 150 }, { h: 'HSN', x: M + 172, w: 40 }, { h: 'Qty', x: M + 300, w: 30, r: true }, { h: 'Rate', x: M + 370, w: 50, r: true }, { h: 'GST%', x: M + 420, w: 35, r: true }, { h: 'Amount', x: W - M, w: 60, r: true }];
  page.drawRectangle({ x: M, y: y - 4, width: W - 2 * M, height: 18, color: rgb(0.95, 0.96, 0.98) });
  for (const c of cols) (c.r ? right(c.h, c.x, y, 8.5, bold, muted) : text(c.h, c.x, y, 8.5, bold, muted));
  y -= 18;

  inv.items.forEach((it, i) => {
    const l = lineTotal(it);
    text(String(i + 1), M, y, 9);
    const yDesc = wrap(it.description || '—', M + 20, y, 145, 9, font, ink);
    text(it.hsn || '', M + 172, y, 8.5, font, muted);
    right(String(it.qty || 0), M + 300, y, 9);
    right(money(it.rate || 0).replace('Rs. ', ''), M + 370, y, 9);
    right(`${it.gstPercent || 0}%`, M + 420, y, 9);
    right(l.taxable.toLocaleString('en-IN', { minimumFractionDigits: 2 }), W - M, y, 9);
    y = Math.min(y - 16, yDesc - 2);
    page.drawLine({ start: { x: M, y: y + 6 }, end: { x: W - M, y: y + 6 }, thickness: 0.4, color: line });
  });

  y -= 8;
  // Totals block (right side)
  const tx = W - M - 220;
  const totalRow = (label: string, value: string, f: PDFFont = font, size = 9) => {
    text(label, tx, y, size, f, muted);
    right(value, W - M, y, size, f, ink);
    y -= 15;
  };
  totalRow('Subtotal', money(t.subtotal));
  if (t.totalDiscount > 0) totalRow('Discount', '- ' + money(t.totalDiscount));
  totalRow('Taxable value', money(t.taxable));
  if (inv.interState) totalRow(`IGST`, money(t.igst));
  else {
    totalRow('CGST', money(t.cgst));
    totalRow('SGST', money(t.sgst));
  }
  if (t.roundOff !== 0) totalRow('Round off', (t.roundOff > 0 ? '+ ' : '- ') + money(Math.abs(t.roundOff)));
  y -= 2;
  page.drawRectangle({ x: tx - 8, y: y - 4, width: W - M - tx + 8, height: 20, color: accent });
  text('Grand Total', tx, y, 11, bold, rgb(1, 1, 1));
  right(money(t.grandTotal), W - M, y, 11, bold, rgb(1, 1, 1));
  y -= 28;

  // Amount in words
  y = wrap(`Amount in words: ${amountInWords(t.grandTotal)}`, M, y, W - 2 * M, 9, bold, ink) - 6;

  // Tax summary table
  if (t.byRate.length) {
    hr(y);
    y -= 14;
    text('Tax summary', M, y, 8.5, bold, muted);
    y -= 14;
    const heads = inv.interState ? ['GST%', 'Taxable', 'IGST'] : ['GST%', 'Taxable', 'CGST', 'SGST'];
    const xs = inv.interState ? [M, M + 90, W - M] : [M, M + 90, M + 230, W - M];
    heads.forEach((h, i) => (i === heads.length - 1 || (i > 0 && !inv.interState) ? right(h, xs[i], y, 8, font, muted) : text(h, xs[i], y, 8, font, muted)));
    y -= 13;
    for (const r of t.byRate) {
      text(`${r.rate}%`, M, y, 8.5);
      right(money(r.taxable), M + 160, y, 8.5);
      if (inv.interState) right(money(r.igst), W - M, y, 8.5);
      else {
        right(money(r.cgst), M + 230, y, 8.5);
        right(money(r.sgst), W - M, y, 8.5);
      }
      y -= 13;
    }
  }

  // Notes + footer
  if (inv.notes.trim()) {
    y -= 6;
    text('Notes', M, y, 8.5, bold, muted);
    y -= 13;
    y = wrap(inv.notes, M, y, W - 2 * M, 8.5);
  }
  text('Generated with Dhurta Suite (suite.dhurta.org) — processed in your browser, not uploaded.', M, 30, 7.5, font, muted);

  const bytes = await doc.save();
  return new Blob([bytes as BlobPart], { type: 'application/pdf' });
}
