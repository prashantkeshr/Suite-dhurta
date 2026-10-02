import { useState, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { ArrowRightLeft, Check, ChevronRight, Copy, Download } from 'lucide-react';
import { copyText, saveFile } from '@/conversion/download';
import { useStore } from '@/storage/store';
import { t } from '@/i18n';
import { Button } from '@/components/ui/primitives';
import { toast } from '@/components/ui/Toast';
import { useTray, asFile, currentToolId } from '@/filesystem/tray';

export function Breadcrumb({ items }: { items: { label: string; to?: string }[] }) {
  return (
    <nav aria-label="Breadcrumb" className="mb-3 text-[13px] text-muted">
      <ol className="flex flex-wrap items-center gap-1">
        {items.map((item, i) => (
          <li key={i} className="flex items-center gap-1">
            {i > 0 && <ChevronRight size={13} aria-hidden />}
            {item.to ? (
              <Link to={item.to} className="hover:text-fg">
                {item.label}
              </Link>
            ) : (
              <span aria-current="page" className="text-fg">
                {item.label}
              </span>
            )}
          </li>
        ))}
      </ol>
    </nav>
  );
}

export function CopyButton({ text, label = t('action.copy'), size = 'sm' as const, disabled }: { text: string; label?: string; size?: 'sm' | 'md'; disabled?: boolean }) {
  const [done, setDone] = useState(false);
  return (
    <Button
      size={size}
      disabled={disabled || !text}
      icon={done ? <Check size={14} /> : <Copy size={14} />}
      onClick={async () => {
        if (await copyText(text)) {
          setDone(true);
          setTimeout(() => setDone(false), 1500);
        } else toast.error('Could not copy to the clipboard', 'Your browser blocked clipboard access. Select the text and copy it manually.');
      }}
    >
      {done ? t('action.copied') : label}
    </Button>
  );
}

/**
 * Save a generated blob, honouring the user's save-dialog preference. The
 * result also goes to the file tray, so it can be used in another tool.
 */
export function useSaver() {
  const useDialog = useStore((s) => s.settings.useSaveDialog);
  return async (blob: Blob, name: string) => {
    const ids = useTray.getState().add([asFile(blob, name)], 'result', currentToolId());
    const r = await saveFile(blob, name, { useDialog });
    if (r === 'cancelled') return;
    const next = { label: 'Use in another tool', onClick: () => useTray.getState().show(ids) };
    if (r === 'saved') toast.success(`Saved ${name}`, undefined, next);
    else toast.success(`Downloaded ${name}`, 'You can also continue with it in another tool.', next);
  };
}

/** Send results straight to the file tray and offer tools to continue with — no download needed. */
export function ContinueButton({ files, label = 'Use in another tool', size = 'sm' }: { files: { blob: Blob; name: string }[]; label?: string; size?: 'sm' | 'md' }) {
  return (
    <Button
      size={size}
      disabled={!files.length}
      icon={<ArrowRightLeft size={14} />}
      onClick={() => {
        const ids = useTray.getState().add(files.map((f) => asFile(f.blob, f.name)), 'result', currentToolId());
        useTray.getState().show(ids);
      }}
    >
      {label}
    </Button>
  );
}

export function DownloadTextButton({ text, filename, mime = 'text/plain', label = t('action.download') }: { text: string; filename: string; mime?: string; label?: string }) {
  const save = useSaver();
  return (
    <Button size="sm" disabled={!text} icon={<Download size={14} />} onClick={() => save(new Blob([text], { type: `${mime};charset=utf-8` }), filename)}>
      {label}
    </Button>
  );
}

/** Standard text input → output layout used by the text/developer tools. */
export function TextPanel({
  label,
  value,
  onChange,
  readOnly,
  placeholder,
  actions,
  rows = 10,
  invalid,
  id,
}: {
  label: string;
  value: string;
  onChange?: (v: string) => void;
  readOnly?: boolean;
  placeholder?: string;
  actions?: ReactNode;
  rows?: number;
  invalid?: boolean;
  id?: string;
}) {
  return (
    <div className="flex min-w-0 flex-col">
      <div className="mb-1.5 flex min-h-[32px] flex-wrap items-center justify-between gap-2">
        <label htmlFor={id} className="label mb-0">
          {label}
        </label>
        <div className="flex flex-wrap gap-1.5">{actions}</div>
      </div>
      <textarea
        id={id}
        className="textarea"
        value={value}
        rows={rows}
        readOnly={readOnly}
        placeholder={placeholder}
        spellCheck={false}
        aria-invalid={invalid || undefined}
        onChange={(e) => onChange?.(e.target.value)}
      />
    </div>
  );
}

/** Small key/value table for results and metadata. */
export function InfoTable({ rows }: { rows: [string, ReactNode][] }) {
  return (
    <dl className="grid grid-cols-[minmax(110px,auto)_1fr] gap-x-4 gap-y-1.5 text-sm">
      {rows.map(([k, v]) => (
        <div key={k} className="contents">
          <dt className="text-muted">{k}</dt>
          <dd className="min-w-0 break-words font-medium text-fg">{v}</dd>
        </div>
      ))}
    </dl>
  );
}

/** Shows a formula so calculators are transparent about how results are computed. */
export function Formula({ children }: { children: ReactNode }) {
  return (
    <div className="rounded-md border border-line bg-surface2 px-3 py-2 font-mono text-[12.5px] text-muted">
      <span className="mr-2 font-sans text-[11px] font-semibold uppercase tracking-wide">Formula</span>
      {children}
    </div>
  );
}
