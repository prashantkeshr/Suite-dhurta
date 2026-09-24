import { useState } from 'react';
import { ChevronRight } from 'lucide-react';
import { clsx } from 'clsx';

const PAGE = 200;

function Value({ v }: { v: unknown }) {
  if (v === null) return <span className="text-muted">null</span>;
  if (typeof v === 'string') return <span className="break-all text-success">"{v}"</span>;
  if (typeof v === 'number') return <span className="text-info">{String(v)}</span>;
  if (typeof v === 'boolean') return <span className="text-warning">{String(v)}</span>;
  return null;
}

function Node({ name, value, depth, path }: { name: string | number | null; value: unknown; depth: number; path: string }) {
  const isObj = value !== null && typeof value === 'object';
  const entries = isObj ? (Array.isArray(value) ? value.map((v, i) => [i, v] as const) : Object.entries(value as object)) : [];
  const [open, setOpen] = useState(depth < 2);
  const [shown, setShown] = useState(PAGE);
  const label = name === null ? null : typeof name === 'number' ? <span className="text-muted">{name}</span> : <span className="text-accent">"{name}"</span>;

  if (!isObj) {
    return (
      <div className="flex gap-1 py-0.5 pl-5" title={path}>
        {label}
        {label && <span className="text-muted">:</span>}
        <Value v={value} />
      </div>
    );
  }
  const brackets = Array.isArray(value) ? ['[', ']'] : ['{', '}'];
  return (
    <div>
      <button onClick={() => setOpen(!open)} aria-expanded={open} className="flex w-full items-center gap-1 rounded py-0.5 text-left hover:bg-surface2" title={path}>
        <ChevronRight size={14} className={clsx('shrink-0 text-muted transition-transform', open && 'rotate-90')} aria-hidden />
        {label}
        {label && <span className="text-muted">:</span>}
        <span className="text-muted">
          {brackets[0]}
          {!open && `… ${entries.length} ${Array.isArray(value) ? 'items' : 'keys'} ${brackets[1]}`}
        </span>
      </button>
      {open && (
        <div className="ml-2 border-l border-line pl-2">
          {entries.slice(0, shown).map(([k, v]) => (
            <Node key={String(k)} name={k} value={v} depth={depth + 1} path={typeof k === 'number' ? `${path}[${k}]` : /^[A-Za-z_$][\w$]*$/.test(k) ? `${path}.${k}` : `${path}[${JSON.stringify(k)}]`} />
          ))}
          {entries.length > shown && (
            <button onClick={() => setShown(shown + PAGE)} className="py-1 pl-5 text-xs text-accent hover:underline">
              Show {Math.min(PAGE, entries.length - shown)} more of {entries.length - shown} remaining
            </button>
          )}
          <div className="pl-1 text-muted">{brackets[1]}</div>
        </div>
      )}
    </div>
  );
}

/** Collapsible JSON explorer. Hover a node to see its path. */
export function JsonTree({ value }: { value: unknown }) {
  return (
    <div className="max-h-[560px] overflow-auto rounded-md border border-line bg-surface p-2 font-mono text-[13px]" role="tree" aria-label="JSON tree">
      <Node name={null} value={value} depth={0} path="$" />
    </div>
  );
}
