import { useEffect, useRef, useState } from 'react';
import { Eraser } from 'lucide-react';
import { Button } from '@/components/ui/primitives';
import { canvasToBlob } from './render';

/** Crop a canvas to the bounding box of its non-transparent pixels. */
export function trimCanvas(src: HTMLCanvasElement, pad = 8): HTMLCanvasElement | null {
  const ctx = src.getContext('2d')!;
  const { width, height } = src;
  const data = ctx.getImageData(0, 0, width, height).data;
  let minX = width, minY = height, maxX = -1, maxY = -1;
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      if (data[(y * width + x) * 4 + 3] > 8) {
        if (x < minX) minX = x;
        if (x > maxX) maxX = x;
        if (y < minY) minY = y;
        if (y > maxY) maxY = y;
      }
    }
  }
  if (maxX < 0) return null;
  const out = document.createElement('canvas');
  out.width = maxX - minX + 1 + pad * 2;
  out.height = maxY - minY + 1 + pad * 2;
  out.getContext('2d')!.drawImage(src, minX - pad, minY - pad, out.width, out.height, 0, 0, out.width, out.height);
  return out;
}

/** Draw-a-signature pad (mouse, pen or touch). Emits a trimmed transparent PNG. */
export function SignaturePad({ color, onChange }: { color: string; onChange: (png: Blob | null) => void }) {
  const ref = useRef<HTMLCanvasElement>(null);
  const drawing = useRef(false);
  const last = useRef<{ x: number; y: number } | null>(null);
  const [empty, setEmpty] = useState(true);

  useEffect(() => {
    const c = ref.current!;
    const ratio = Math.min(3, window.devicePixelRatio || 1);
    c.width = c.clientWidth * ratio;
    c.height = c.clientHeight * ratio;
    const ctx = c.getContext('2d')!;
    ctx.scale(ratio, ratio);
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
  }, []);

  const point = (e: React.PointerEvent) => {
    const r = ref.current!.getBoundingClientRect();
    return { x: e.clientX - r.left, y: e.clientY - r.top, p: e.pressure || 0.5 };
  };

  const emit = async () => {
    const trimmed = trimCanvas(ref.current!);
    onChange(trimmed ? await canvasToBlob(trimmed, 'image/png') : null);
  };

  return (
    <div>
      <canvas
        ref={ref}
        aria-label="Signature drawing area. Draw your signature with a mouse, pen or finger."
        role="img"
        className="h-44 w-full touch-none rounded-md border border-dashed border-line bg-white"
        onPointerDown={(e) => {
          e.currentTarget.setPointerCapture(e.pointerId);
          drawing.current = true;
          last.current = point(e);
        }}
        onPointerMove={(e) => {
          if (!drawing.current || !last.current) return;
          const ctx = ref.current!.getContext('2d')!;
          const p = point(e);
          ctx.strokeStyle = color;
          ctx.lineWidth = 1.5 + p.p * 2.5;
          ctx.beginPath();
          ctx.moveTo(last.current.x, last.current.y);
          ctx.lineTo(p.x, p.y);
          ctx.stroke();
          last.current = p;
          if (empty) setEmpty(false);
        }}
        onPointerUp={() => {
          drawing.current = false;
          last.current = null;
          void emit();
        }}
        onPointerCancel={() => {
          drawing.current = false;
          last.current = null;
        }}
      />
      <div className="mt-2 flex items-center justify-between">
        <p className="text-xs text-muted">{empty ? 'Draw above.' : 'Looks good? Place it on the page.'}</p>
        <Button
          size="sm"
          variant="ghost"
          icon={<Eraser size={14} />}
          onClick={() => {
            const c = ref.current!;
            c.getContext('2d')!.clearRect(0, 0, c.width, c.height);
            setEmpty(true);
            onChange(null);
          }}
        >
          Clear
        </Button>
      </div>
    </div>
  );
}
