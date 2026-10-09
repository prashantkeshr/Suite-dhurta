import { useEffect, useMemo, useState } from 'react';
import { Plus, Trash2, Download, Save, FileText } from 'lucide-react';
import type { ToolDefinition } from '@/types/tool';
import { Button, Card, Segmented, Toggle } from '@/components/ui/primitives';
import { useSaver, ContinueButton } from '@/components/tools/common';
import { toast } from '@/components/ui/Toast';
import { kvGet, kvSet } from '@/storage/kv';
import { computeInvoice, amountInWords, type Invoice, type InvoiceParty, type LineItem } from './invoice';
import { invoicePdf } from './invoicePdf';

const money = (n: number) => 'Rs. ' + n.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const emptyParty = (): InvoiceParty => ({ name: '', address: '', gstin: '', email: '', phone: '', state: '' });
const emptyItem = (): LineItem => ({ description: '', hsn: '', qty: 1, rate: 0, gstPercent: 18, discount: 0 });
const SELLER_KEY = 'invoice-seller';

function Field({ label, value, onChange, placeholder, area, type = 'text', wide }: { label: string; value: string; onChange: (v: string) => void; placeholder?: string; area?: boolean; type?: string; wide?: boolean }) {
  return (
    <div className={wide ? 'sm:col-span-2' : ''}>
      <label className="label">{label}</label>
      {area ? <textarea className="input min-h-[60px] py-1.5" value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} /> : <input className="input" type={type} value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} />}
    </div>
  );
}

function PartyForm({ party, set }: { party: InvoiceParty; set: (p: InvoiceParty) => void }) {
  const f = (k: keyof InvoiceParty) => (v: string) => set({ ...party, [k]: v });
  return (
    <div className="grid gap-3 sm:grid-cols-2">
      <Field label="Name / business" value={party.name} onChange={f('name')} wide />
      <Field label="Address" value={party.address} onChange={f('address')} area wide />
      <Field label="GSTIN" value={party.gstin} onChange={f('gstin')} placeholder="22AAAAA0000A1Z5" />
      <Field label="State" value={party.state} onChange={f('state')} placeholder="Maharashtra" />
      <Field label="Email" value={party.email} onChange={f('email')} type="email" />
      <Field label="Phone" value={party.phone} onChange={f('phone')} />
    </div>
  );
}

export default function InvoiceTool(_: { tool: ToolDefinition }) {
  const [seller, setSeller] = useState<InvoiceParty>(emptyParty);
  const [buyer, setBuyer] = useState<InvoiceParty>(emptyParty);
  const [items, setItems] = useState<LineItem[]>([emptyItem()]);
  const [number, setNumber] = useState('INV-001');
  const [date, setDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [interState, setInterState] = useState(false);
  const [notes, setNotes] = useState('Thank you for your business.');
  const [tab, setTab] = useState<'seller' | 'buyer' | 'items'>('seller');
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<{ blob: Blob; name: string } | null>(null);
  const save = useSaver();

  useEffect(() => {
    void kvGet<InvoiceParty>(SELLER_KEY).then((s) => s && setSeller(s));
  }, []);

  const invoice: Invoice = useMemo(() => ({ number, date, seller, buyer, items, interState, notes, currency: 'INR' }), [number, date, seller, buyer, items, interState, notes]);
  const totals = useMemo(() => computeInvoice(invoice), [invoice]);

  const setItem = (i: number, patch: Partial<LineItem>) => setItems(items.map((it, k) => (k === i ? { ...it, ...patch } : it)));
  const num = (v: string) => Math.max(0, Number(v.replace(/[^\d.]/g, '')) || 0);

  const generate = async () => {
    if (!seller.name || !buyer.name) {
      toast.warning('Add names', 'Enter at least the seller and buyer names.');
      setTab(!seller.name ? 'seller' : 'buyer');
      return;
    }
    setBusy(true);
    try {
      const blob = await invoicePdf(invoice);
      setResult({ blob, name: `${number || 'invoice'}.pdf` });
    } catch {
      toast.error('Could not create the invoice PDF.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_320px]">
      <div className="min-w-0 space-y-4">
        <Card className="space-y-3 p-4">
          <div className="grid gap-3 sm:grid-cols-3">
            <Field label="Invoice number" value={number} onChange={setNumber} />
            <div>
              <label className="label">Date</label>
              <input type="date" className="input" value={date} onChange={(e) => setDate(e.target.value)} />
            </div>
            <div className="flex items-end">
              <Toggle checked={interState} onChange={setInterState} label="Inter-state (IGST)" />
            </div>
          </div>
        </Card>

        <Segmented label="Details" value={tab} onChange={setTab} options={[{ value: 'seller', label: 'Seller' }, { value: 'buyer', label: 'Buyer' }, { value: 'items', label: `Items (${items.length})` }]} />

        {tab === 'seller' && (
          <Card className="space-y-3 p-4">
            <PartyForm party={seller} set={setSeller} />
            <Button size="sm" icon={<Save size={14} />} onClick={() => (kvSet(SELLER_KEY, seller), toast.success('Seller details saved on this device'))}>
              Save my details for next time
            </Button>
          </Card>
        )}
        {tab === 'buyer' && (
          <Card className="p-4">
            <PartyForm party={buyer} set={setBuyer} />
          </Card>
        )}
        {tab === 'items' && (
          <Card className="space-y-3 p-3">
            {items.map((it, i) => (
              <div key={i} className="rounded-md border border-line p-3">
                <div className="mb-2 flex items-center justify-between">
                  <span className="text-xs font-semibold text-muted">Item {i + 1}</span>
                  <Button size="sm" variant="ghost" icon={<Trash2 size={14} />} onClick={() => setItems(items.filter((_, k) => k !== i))} disabled={items.length === 1} aria-label="Remove item" />
                </div>
                <div className="grid gap-2 sm:grid-cols-2">
                  <Field label="Description" value={it.description} onChange={(v) => setItem(i, { description: v })} wide />
                  <Field label="HSN/SAC" value={it.hsn} onChange={(v) => setItem(i, { hsn: v })} />
                  <div>
                    <label className="label">GST %</label>
                    <select className="input pr-8" value={it.gstPercent} onChange={(e) => setItem(i, { gstPercent: Number(e.target.value) })}>
                      {[0, 0.25, 3, 5, 12, 18, 28, 40].map((r) => (
                        <option key={r} value={r}>{r}%</option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="label">Quantity</label>
                    <input className="input tabular-nums" inputMode="decimal" value={it.qty} onChange={(e) => setItem(i, { qty: num(e.target.value) })} />
                  </div>
                  <div>
                    <label className="label">Rate (Rs.)</label>
                    <input className="input tabular-nums" inputMode="decimal" value={it.rate} onChange={(e) => setItem(i, { rate: num(e.target.value) })} />
                  </div>
                  <div>
                    <label className="label">Discount (Rs.)</label>
                    <input className="input tabular-nums" inputMode="decimal" value={it.discount} onChange={(e) => setItem(i, { discount: num(e.target.value) })} />
                  </div>
                </div>
                <p className="mt-2 text-right text-sm text-muted">Line total: <strong className="text-fg">{money(totals.lines[i]?.total ?? 0)}</strong></p>
              </div>
            ))}
            <Button size="sm" icon={<Plus size={14} />} onClick={() => setItems([...items, emptyItem()])}>
              Add item
            </Button>
          </Card>
        )}

        <Field label="Notes / terms" value={notes} onChange={setNotes} area />
      </div>

      <div className="space-y-3 lg:sticky lg:top-20 lg:h-fit">
        <Card className="space-y-2 p-4">
          <h2 className="text-sm font-semibold">Summary</h2>
          <Row label="Taxable value" value={money(totals.taxable)} />
          {interState ? <Row label="IGST" value={money(totals.igst)} /> : (<><Row label="CGST" value={money(totals.cgst)} /><Row label="SGST" value={money(totals.sgst)} /></>)}
          {totals.roundOff !== 0 && <Row label="Round off" value={money(totals.roundOff)} />}
          <div className="border-t border-line pt-2">
            <Row label="Grand total" value={money(totals.grandTotal)} big />
          </div>
          <p className="text-xs text-muted">{amountInWords(totals.grandTotal)}</p>
        </Card>
        {!result ? (
          <Button variant="primary" size="lg" className="w-full justify-center" icon={<FileText size={16} />} loading={busy} onClick={generate}>
            Generate invoice PDF
          </Button>
        ) : (
          <Card className="space-y-2 border-success/30 p-3">
            <p className="text-sm font-medium text-success">Invoice ready</p>
            <Button variant="primary" className="w-full justify-center" icon={<Download size={16} />} onClick={() => save(result.blob, result.name)}>
              Download {result.name}
            </Button>
            <ContinueButton size="md" files={[result]} />
            <Button className="w-full justify-center" onClick={() => setResult(null)}>
              Edit and regenerate
            </Button>
          </Card>
        )}
        <p className="text-xs text-muted">The invoice is built in your browser. The rupee sign is written as “Rs.” because standard PDF fonts cannot embed ₹. Confirm GST rates for your goods or services.</p>
      </div>
    </div>
  );
}

function Row({ label, value, big }: { label: string; value: string; big?: boolean }) {
  return (
    <div className="flex items-center justify-between">
      <span className={big ? 'font-semibold' : 'text-sm text-muted'}>{label}</span>
      <span className={big ? 'text-lg font-semibold tabular-nums' : 'text-sm tabular-nums'}>{value}</span>
    </div>
  );
}
