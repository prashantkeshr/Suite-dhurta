import { create } from 'zustand';
import { CheckCircle2, Info, AlertTriangle, XCircle, X } from 'lucide-react';
import { clsx } from 'clsx';

export type ToastType = 'success' | 'info' | 'warning' | 'error';

interface ToastItem {
  id: number;
  type: ToastType;
  message: string;
  detail?: string;
}

interface ToastState {
  toasts: ToastItem[];
  push: (type: ToastType, message: string, detail?: string) => void;
  dismiss: (id: number) => void;
}

let nextId = 1;

const useToasts = create<ToastState>((set, get) => ({
  toasts: [],
  push(type, message, detail) {
    const id = nextId++;
    set({ toasts: [...get().toasts.slice(-3), { id, type, message, detail }] });
    setTimeout(() => get().dismiss(id), type === 'error' ? 8000 : 4500);
  },
  dismiss(id) {
    set({ toasts: get().toasts.filter((t) => t.id !== id) });
  },
}));

/** Show a notification from anywhere (components or plain functions). */
export const toast = {
  success: (m: string, d?: string) => useToasts.getState().push('success', m, d),
  info: (m: string, d?: string) => useToasts.getState().push('info', m, d),
  warning: (m: string, d?: string) => useToasts.getState().push('warning', m, d),
  error: (m: string, d?: string) => useToasts.getState().push('error', m, d),
};

const ICON = { success: CheckCircle2, info: Info, warning: AlertTriangle, error: XCircle };
const TONE = { success: 'text-success', info: 'text-info', warning: 'text-warning', error: 'text-error' };

export function Toaster() {
  const { toasts, dismiss } = useToasts();
  return (
    <div
      aria-live="polite"
      aria-relevant="additions"
      className="pointer-events-none fixed inset-x-0 bottom-[76px] z-[60] flex flex-col items-center gap-2 px-4 md:bottom-6 md:left-auto md:right-6 md:items-end"
    >
      {toasts.map((item) => {
        const I = ICON[item.type];
        return (
          <div
            key={item.id}
            role={item.type === 'error' ? 'alert' : 'status'}
            className="animate-in pointer-events-auto flex w-full max-w-sm items-start gap-3 rounded-lg border border-line bg-surface px-4 py-3"
            style={{ boxShadow: 'var(--shadow-lg)' }}
          >
            <I size={18} className={clsx('mt-0.5 shrink-0', TONE[item.type])} aria-hidden />
            <div className="min-w-0 flex-1 text-sm">
              <p className="font-medium text-fg">{item.message}</p>
              {item.detail && <p className="mt-0.5 text-muted">{item.detail}</p>}
            </div>
            <button onClick={() => dismiss(item.id)} className="shrink-0 rounded p-1 text-muted hover:text-fg" aria-label="Dismiss notification">
              <X size={14} />
            </button>
          </div>
        );
      })}
    </div>
  );
}
