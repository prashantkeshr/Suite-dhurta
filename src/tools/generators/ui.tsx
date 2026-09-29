import { useId, useRef, type ReactNode } from 'react';
import { clsx } from 'clsx';

/** Colour swatch + hex text field. */
export function ColorField({ label, value, onChange, disabled }: { label: string; value: string; onChange: (v: string) => void; disabled?: boolean }) {
  const id = useId();
  return (
    <div className={clsx(disabled && 'opacity-50')}>
      <label htmlFor={id} className="label">
        {label}
      </label>
      <div className="flex items-center gap-2">
        <input type="color" aria-label={`${label} picker`} value={/^#[0-9a-f]{6}$/i.test(value) ? value : '#000000'} disabled={disabled} onChange={(e) => onChange(e.target.value)} className="h-10 w-11 shrink-0 cursor-pointer rounded-md border border-line bg-surface p-1" />
        <input id={id} className="input font-mono uppercase" value={value} disabled={disabled} maxLength={7} onChange={(e) => onChange(e.target.value.startsWith('#') ? e.target.value : `#${e.target.value}`)} />
      </div>
    </div>
  );
}

/** Row of toggle buttons that wraps on small screens. */
export function ChoiceRow<T extends string>({ label, value, onChange, options }: { label: string; value: T; onChange: (v: T) => void; options: { value: T; label: ReactNode; title?: string }[] }) {
  return (
    <div>
      <span className="label">{label}</span>
      <div role="radiogroup" aria-label={label} className="flex flex-wrap gap-1">
        {options.map((o) => (
          <button
            key={o.value}
            role="radio"
            aria-checked={value === o.value}
            title={o.title}
            onClick={() => onChange(o.value)}
            className={clsx('min-h-[36px] rounded-md border px-3 text-[13px] font-medium transition-colors', value === o.value ? 'border-accent bg-accent/10 text-accent' : 'border-line bg-surface text-muted hover:text-fg')}
          >
            {o.label}
          </button>
        ))}
      </div>
    </div>
  );
}

export function RangeField({ label, value, min, max, step, onChange, format }: { label: string; value: number; min: number; max: number; step: number; onChange: (v: number) => void; format?: (v: number) => string }) {
  const id = useId();
  return (
    <div>
      <label htmlFor={id} className="label flex justify-between">
        <span>{label}</span>
        <span className="tabular-nums text-muted">{format ? format(value) : value}</span>
      </label>
      <input id={id} type="range" min={min} max={max} step={step} value={value} onChange={(e) => onChange(Number(e.target.value))} className="w-full accent-[rgb(var(--accent))]" />
    </div>
  );
}

/** Button that opens a file picker without registering the global Ctrl+O target. */
export function PickFileButton({ accept, onFile, children, className }: { accept: string; onFile: (f: File) => void; children: ReactNode; className?: string }) {
  const ref = useRef<HTMLInputElement>(null);
  return (
    <>
      <button type="button" onClick={() => ref.current?.click()} className={clsx('inline-flex h-10 items-center gap-2 rounded-md border border-line bg-surface px-3.5 text-sm font-medium hover:bg-surface2', className)}>
        {children}
      </button>
      <input
        ref={ref}
        type="file"
        accept={accept}
        hidden
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) onFile(f);
          e.target.value = '';
        }}
      />
    </>
  );
}
