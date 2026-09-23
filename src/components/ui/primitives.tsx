import { clsx } from 'clsx';
import { forwardRef, useId, useState, type ButtonHTMLAttributes, type ReactNode, type SelectHTMLAttributes, type InputHTMLAttributes } from 'react';
import { Loader2 } from 'lucide-react';
import type { ToolStatus } from '@/types/tool';
import { t } from '@/i18n';

/* ---------- Button ---------- */

type Variant = 'primary' | 'secondary' | 'ghost' | 'danger';
type Size = 'sm' | 'md' | 'lg' | 'icon';

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  size?: Size;
  loading?: boolean;
  icon?: ReactNode;
}

const variants: Record<Variant, string> = {
  primary: 'bg-accent text-accent-fg hover:bg-accent/90 border border-transparent',
  secondary: 'bg-surface text-fg border border-line hover:bg-surface2',
  ghost: 'bg-transparent text-fg border border-transparent hover:bg-surface2',
  danger: 'bg-error text-white border border-transparent hover:bg-error/90',
};
const sizes: Record<Size, string> = {
  sm: 'h-8 px-2.5 text-[13px] gap-1.5',
  md: 'h-10 px-3.5 text-sm gap-2',
  lg: 'h-12 px-5 text-[15px] gap-2',
  icon: 'h-10 w-10 justify-center',
};

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { variant = 'secondary', size = 'md', loading, icon, className, children, disabled, type = 'button', ...rest },
  ref,
) {
  return (
    <button
      ref={ref}
      type={type}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      className={clsx(
        'inline-flex items-center rounded-md font-medium transition-colors select-none whitespace-nowrap',
        'disabled:opacity-50 disabled:cursor-not-allowed',
        variants[variant],
        sizes[size],
        className,
      )}
      {...rest}
    >
      {loading ? <Loader2 size={16} className="animate-spin" aria-hidden /> : icon}
      {children}
    </button>
  );
});

/* ---------- Badge ---------- */

const statusStyles: Record<ToolStatus, string> = {
  available: 'bg-success/10 text-success border-success/25',
  beta: 'bg-info/10 text-info border-info/25',
  limited: 'bg-warning/10 text-warning border-warning/25',
  'coming-soon': 'bg-surface2 text-muted border-line',
  unavailable: 'bg-error/10 text-error border-error/25',
};

export function StatusBadge({ status, hideAvailable = false, className }: { status: ToolStatus; hideAvailable?: boolean; className?: string }) {
  if (hideAvailable && status === 'available') return null;
  return (
    <span className={clsx('inline-flex items-center rounded border px-1.5 py-px text-[10.5px] font-semibold uppercase tracking-wide', statusStyles[status], className)}>
      {t(`status.${status}`)}
    </span>
  );
}

export function Badge({ children, tone = 'neutral', className }: { children: ReactNode; tone?: 'neutral' | 'accent' | 'success' | 'warning' | 'error'; className?: string }) {
  const tones = {
    neutral: 'bg-surface2 text-muted border-line',
    accent: 'bg-accent/10 text-accent border-accent/25',
    success: 'bg-success/10 text-success border-success/25',
    warning: 'bg-warning/10 text-warning border-warning/25',
    error: 'bg-error/10 text-error border-error/25',
  };
  return <span className={clsx('inline-flex items-center gap-1 rounded border px-1.5 py-px text-[11px] font-medium', tones[tone], className)}>{children}</span>;
}

/* ---------- Card ---------- */

export function Card({ children, className, as: As = 'div' }: { children: ReactNode; className?: string; as?: 'div' | 'section' | 'article' }) {
  return <As className={clsx('card', className)}>{children}</As>;
}

/* ---------- Progress ---------- */

/** Determinate when `value` is a number; otherwise an indeterminate bar with no fake percentage. */
export function Progress({ value, label, className }: { value: number | null; label: string; className?: string }) {
  const determinate = typeof value === 'number';
  return (
    <div
      role="progressbar"
      aria-label={label}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={determinate ? Math.round(value * 100) : undefined}
      aria-valuetext={determinate ? `${Math.round(value * 100)}%` : t('queue.processing')}
      className={clsx('relative h-1.5 w-full overflow-hidden rounded-full bg-surface2', className)}
    >
      {determinate ? (
        <div className="h-full rounded-full bg-accent transition-[width] duration-200" style={{ width: `${Math.round(value * 100)}%` }} />
      ) : (
        <div className="indeterminate absolute inset-y-0 w-2/5 rounded-full bg-accent/70" />
      )}
    </div>
  );
}

/* ---------- Form fields ---------- */

export function Field({ label, hint, children, htmlFor }: { label: string; hint?: string; children: ReactNode; htmlFor?: string }) {
  return (
    <div>
      <label className="label" htmlFor={htmlFor}>
        {label}
      </label>
      {children}
      {hint && <p className="mt-1 text-xs text-muted">{hint}</p>}
    </div>
  );
}

export function TextInput({ label, hint, className, ...rest }: InputHTMLAttributes<HTMLInputElement> & { label: string; hint?: string }) {
  const id = useId();
  return (
    <Field label={label} hint={hint} htmlFor={id}>
      <input id={id} className={clsx('input', className)} {...rest} />
    </Field>
  );
}

export function Select({ label, hint, options, className, ...rest }: SelectHTMLAttributes<HTMLSelectElement> & { label: string; hint?: string; options: { value: string; label: string; disabled?: boolean }[] }) {
  const id = useId();
  return (
    <Field label={label} hint={hint} htmlFor={id}>
      <select id={id} className={clsx('input pr-8', className)} {...rest}>
        {options.map((o) => (
          <option key={o.value} value={o.value} disabled={o.disabled}>
            {o.label}
          </option>
        ))}
      </select>
    </Field>
  );
}

export function Toggle({ checked, onChange, label, description }: { checked: boolean; onChange: (v: boolean) => void; label: string; description?: string }) {
  const id = useId();
  return (
    <div className="flex items-start justify-between gap-4 py-2">
      <div>
        <label htmlFor={id} className="text-sm font-medium text-fg cursor-pointer">
          {label}
        </label>
        {description && <p className="text-xs text-muted mt-0.5">{description}</p>}
      </div>
      <button
        id={id}
        role="switch"
        aria-checked={checked}
        onClick={() => onChange(!checked)}
        className={clsx('relative mt-0.5 h-6 w-11 shrink-0 rounded-full border transition-colors', checked ? 'bg-accent border-accent' : 'bg-surface2 border-line')}
      >
        <span className={clsx('absolute top-0.5 h-[18px] w-[18px] rounded-full bg-white shadow transition-transform', checked ? 'translate-x-[22px]' : 'translate-x-0.5')} />
      </button>
    </div>
  );
}

/** Segmented control for a small set of options. */
export function Segmented<T extends string>({ value, onChange, options, label }: { value: T; onChange: (v: T) => void; options: { value: T; label: string }[]; label: string }) {
  return (
    <div>
      <span className="label">{label}</span>
      <div role="radiogroup" aria-label={label} className="inline-flex flex-wrap gap-1 rounded-md border border-line bg-surface2 p-1">
        {options.map((o) => (
          <button
            key={o.value}
            role="radio"
            aria-checked={value === o.value}
            onClick={() => onChange(o.value)}
            className={clsx(
              'min-h-[32px] rounded px-3 text-[13px] font-medium transition-colors',
              value === o.value ? 'bg-surface text-fg shadow-sm' : 'text-muted hover:text-fg',
            )}
          >
            {o.label}
          </button>
        ))}
      </div>
    </div>
  );
}

/* ---------- Tabs ---------- */

export function Tabs<T extends string>({ tabs, value, onChange, label }: { tabs: { id: T; label: string }[]; value: T; onChange: (v: T) => void; label: string }) {
  return (
    <div role="tablist" aria-label={label} className="no-scrollbar flex gap-1 overflow-x-auto border-b border-line">
      {tabs.map((tab) => (
        <button
          key={tab.id}
          role="tab"
          aria-selected={value === tab.id}
          onClick={() => onChange(tab.id)}
          onKeyDown={(e) => {
            const i = tabs.findIndex((x) => x.id === value);
            if (e.key === 'ArrowRight') onChange(tabs[(i + 1) % tabs.length].id);
            if (e.key === 'ArrowLeft') onChange(tabs[(i - 1 + tabs.length) % tabs.length].id);
          }}
          className={clsx(
            '-mb-px whitespace-nowrap border-b-2 px-3 py-2 text-sm font-medium transition-colors',
            value === tab.id ? 'border-accent text-fg' : 'border-transparent text-muted hover:text-fg',
          )}
        >
          {tab.label}
        </button>
      ))}
    </div>
  );
}

/* ---------- Disclosure ---------- */

export function Disclosure({ title, children, defaultOpen = false }: { title: ReactNode; children: ReactNode; defaultOpen?: boolean }) {
  const [open, setOpen] = useState(defaultOpen);
  const id = useId();
  return (
    <div className="border-b border-line last:border-0">
      <button aria-expanded={open} aria-controls={id} onClick={() => setOpen(!open)} className="flex w-full items-center justify-between py-3 text-left text-sm font-medium text-fg">
        {title}
        <span className={clsx('text-muted transition-transform', open && 'rotate-90')} aria-hidden>
          ›
        </span>
      </button>
      {open && (
        <div id={id} className="pb-3 text-sm text-muted">
          {children}
        </div>
      )}
    </div>
  );
}

/* ---------- Kbd ---------- */

export const Kbd = ({ children }: { children: ReactNode }) => <kbd className="kbd">{children}</kbd>;
