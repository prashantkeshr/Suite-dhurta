import { Printer, Info } from 'lucide-react';
import { Button, Segmented, Select } from '@/components/ui/primitives';
import type { PageOptions } from './print';

/** Page setup controls shared by the "to PDF" tools. */
export function PageOptionsPanel({ value, onChange, onPrint, busy }: { value: PageOptions; onChange: (v: PageOptions) => void; onPrint: () => void; busy?: boolean }) {
  const set = <K extends keyof PageOptions>(k: K, v: PageOptions[K]) => onChange({ ...value, [k]: v });
  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 gap-2">
        <Select label="Paper" value={value.size} onChange={(e) => set('size', e.target.value as PageOptions['size'])} options={[{ value: 'A4', label: 'A4' }, { value: 'Letter', label: 'US Letter' }, { value: 'Legal', label: 'US Legal' }]} />
        <Select label="Font" value={value.font} onChange={(e) => set('font', e.target.value as PageOptions['font'])} options={[{ value: 'sans', label: 'Sans-serif' }, { value: 'serif', label: 'Serif' }, { value: 'mono', label: 'Monospace' }]} />
      </div>
      <Segmented label="Orientation" value={value.orientation} onChange={(v) => set('orientation', v)} options={[{ value: 'portrait', label: 'Portrait' }, { value: 'landscape', label: 'Landscape' }]} />
      <div className="grid grid-cols-2 gap-2">
        <div>
          <label htmlFor="po-size" className="label">
            Text size (pt)
          </label>
          <input id="po-size" type="number" min={6} max={24} className="input" value={value.fontSizePt} onChange={(e) => set('fontSizePt', Math.min(24, Math.max(6, Number(e.target.value) || 11)))} />
        </div>
        <div>
          <label htmlFor="po-margin" className="label">
            Margin (mm)
          </label>
          <input id="po-margin" type="number" min={0} max={50} className="input" value={value.marginMm} onChange={(e) => set('marginMm', Math.min(50, Math.max(0, Number(e.target.value) || 0)))} />
        </div>
      </div>
      <Button variant="primary" size="lg" className="w-full justify-center" loading={busy} onClick={onPrint} icon={<Printer size={16} />}>
        Save as PDF
      </Button>
      <p className="flex gap-1.5 text-xs text-muted">
        <Info size={13} className="mt-0.5 shrink-0" aria-hidden />
        Opens your browser’s print dialog. Choose <strong className="font-medium text-fg">“Save as PDF”</strong> as the printer. On some phones it’s under Share → Print. Nothing is uploaded.
      </p>
    </div>
  );
}
