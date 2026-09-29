import { useEffect, useMemo, useRef, useState } from 'react';
import { Download } from 'lucide-react';
import JsBarcode from 'jsbarcode';
import type { ToolDefinition } from '@/types/tool';
import { Button, Card, Select, TextInput, Toggle } from '@/components/ui/primitives';
import { useSaver } from '@/components/tools/common';
import { useStore } from '@/storage/store';
import { ChoiceRow, ColorField, RangeField } from './ui';
import { svgToCanvas, canvasToBlob } from './raster';
import { FORMATS, completeGs1, type BarcodeFormat } from './barcode';

export default function BarcodeTool(_: { tool: ToolDefinition }) {
  const save = useSaver();
  const addHistory = useStore((s) => s.addHistory);
  const [format, setFormat] = useState<BarcodeFormat>('CODE128');
  const [value, setValue] = useState(FORMATS[0].example);
  const [showText, setShowText] = useState(true);
  const [barWidth, setBarWidth] = useState(2);
  const [height, setHeight] = useState(90);
  const [fg, setFg] = useState('#000000');
  const [bg, setBg] = useState('#ffffff');
  const [pngScale, setPngScale] = useState('3');
  const svgRef = useRef<SVGSVGElement>(null);
  const [svgText, setSvgText] = useState('');
  const [error, setError] = useState('');

  const meta = FORMATS.find((f) => f.value === format)!;
  const gs1 = useMemo(() => (meta.gs1Digits ? completeGs1(value, meta.gs1Digits) : null), [meta, value]);

  useEffect(() => {
    const el = svgRef.current;
    if (!el) return;
    el.innerHTML = '';
    if (!value.trim()) {
      setError('Enter a value to encode.');
      setSvgText('');
      return;
    }
    if (gs1 && 'error' in gs1) {
      setError(gs1.error);
      setSvgText('');
      return;
    }
    let valid = true;
    try {
      JsBarcode(el, gs1 && 'full' in gs1 ? gs1.full : value, {
        format,
        width: barWidth,
        height,
        displayValue: showText,
        font: 'monospace',
        fontSize: 18,
        margin: 12,
        background: bg,
        lineColor: fg,
        valid: (v: boolean) => {
          valid = v;
        },
      });
    } catch {
      valid = false;
    }
    if (!valid) {
      el.innerHTML = '';
      setError(`This value cannot be encoded as ${meta.label}. ${meta.hint}`);
      setSvgText('');
      return;
    }
    el.setAttribute('xmlns', 'http://www.w3.org/2000/svg');
    setError('');
    setSvgText(new XMLSerializer().serializeToString(el));
  }, [format, value, showText, barWidth, height, fg, bg, gs1, meta]);

  const name = `barcode-${format.toLowerCase()}-${value.replace(/[^\w-]+/g, '_').slice(0, 40)}`;

  return (
    <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
      <Card className="h-fit space-y-4 p-4">
        <ChoiceRow
          label="Format"
          value={format}
          onChange={(f) => {
            setFormat(f);
            setValue(FORMATS.find((x) => x.value === f)!.example);
          }}
          options={FORMATS.map((f) => ({ value: f.value, label: f.label }))}
        />
        <TextInput label="Value" value={value} onChange={(e) => setValue(format === 'CODE39' ? e.target.value.toUpperCase() : e.target.value)} hint={meta.hint} className="font-mono" />
        {gs1 && 'full' in gs1 && gs1.full !== value.replace(/\s/g, '') && (
          <p className="text-sm text-muted">
            Check digit added: <strong className="font-mono text-fg">{gs1.full}</strong>
          </p>
        )}
        <div className="grid gap-x-6 gap-y-3 sm:grid-cols-2">
          <RangeField label="Bar width" value={barWidth} min={1} max={4} step={1} onChange={setBarWidth} format={(v) => `${v} px`} />
          <RangeField label="Height" value={height} min={40} max={200} step={5} onChange={setHeight} format={(v) => `${v} px`} />
          <ColorField label="Bars" value={fg} onChange={setFg} />
          <ColorField label="Background" value={bg} onChange={setBg} />
        </div>
        <Toggle checked={showText} onChange={setShowText} label="Show human-readable text" />
        <p className="text-xs text-muted">Keep dark bars on a light background — most scanners cannot read inverted or low-contrast barcodes. Generating an EAN or UPC does not register it; retail numbers are licensed by GS1.</p>
      </Card>
      <div className="min-w-0 space-y-3">
        <Card className="flex min-h-[220px] items-center justify-center overflow-x-auto p-4">
          <svg ref={svgRef} role="img" aria-label={error ? 'No barcode' : `${meta.label} barcode for ${value}`} className={error ? 'hidden' : 'max-w-full'} />
          {error && <p className="max-w-sm text-center text-sm text-warning">{error}</p>}
        </Card>
        <div className="flex flex-wrap items-end gap-2">
          <Button
            variant="primary"
            icon={<Download size={16} />}
            disabled={!svgText}
            onClick={async () => {
              await save(new Blob([svgText], { type: 'image/svg+xml' }), `${name}.svg`);
              addHistory('barcode-generator', `${meta.label} barcode → SVG`);
            }}
          >
            SVG (print)
          </Button>
          <div className="w-36">
            <Select label="PNG scale" value={pngScale} onChange={(e) => setPngScale(e.target.value)} options={['1', '2', '3', '4', '6'].map((v) => ({ value: v, label: `${v}×` }))} />
          </div>
          <Button
            icon={<Download size={16} />}
            disabled={!svgText}
            onClick={async () => {
              const w = Number(svgRef.current?.getAttribute('width')?.replace('px', '')) || svgRef.current?.getBoundingClientRect().width || 300;
              const canvas = await svgToCanvas(svgText, Math.round(w * Number(pngScale)));
              await save(await canvasToBlob(canvas), `${name}.png`);
              addHistory('barcode-generator', `${meta.label} barcode → PNG`);
            }}
          >
            PNG
          </Button>
        </div>
      </div>
    </div>
  );
}
