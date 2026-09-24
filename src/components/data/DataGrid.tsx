import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import { clsx } from 'clsx';
import { ArrowDown, ArrowUp } from 'lucide-react';

const ROW_H = 34;
const OVERSCAN = 8;

export interface SortState {
  col: number;
  dir: 'asc' | 'desc';
}

export interface DataGridProps {
  header: string[];
  rows: string[][];
  /** Which rows to show, in display order (indices into `rows`). Defaults to all. */
  order?: number[];
  sort?: SortState | null;
  onSort?: (col: number) => void;
  /** Enables cell editing (double-click or Enter). */
  onEdit?: (row: number, col: number, value: string) => void;
  /** Extra controls rendered inside each header cell (e.g. a column menu). */
  headerExtra?: (col: number) => ReactNode;
  rowActions?: (row: number) => ReactNode;
  height?: number;
  colWidth?: number;
  label: string;
}

/**
 * Virtualised table: only the visible rows are rendered, so tens of thousands
 * of rows stay responsive. Cells render as text (never HTML).
 */
export function DataGrid({ header, rows, order, sort, onSort, onEdit, headerExtra, rowActions, height = 480, colWidth = 170, label }: DataGridProps) {
  const scroller = useRef<HTMLDivElement>(null);
  const [scrollTop, setScrollTop] = useState(0);
  const [viewH, setViewH] = useState(height);
  const [editing, setEditing] = useState<{ r: number; c: number; value: string } | null>(null);
  const indices = order ?? rows.map((_, i) => i);

  useLayoutEffect(() => {
    const el = scroller.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setViewH(el.clientHeight));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // Reset scroll when the data set changes size drastically (e.g. new filter).
  useEffect(() => {
    if (scroller.current && scrollTop > indices.length * ROW_H) scroller.current.scrollTop = 0;
  }, [indices.length, scrollTop]);

  const start = Math.max(0, Math.floor(scrollTop / ROW_H) - OVERSCAN);
  const end = Math.min(indices.length, Math.ceil((scrollTop + viewH) / ROW_H) + OVERSCAN);
  const actionsW = rowActions ? 44 : 0;
  const template = `56px repeat(${header.length}, minmax(${colWidth}px, 1fr))${rowActions ? ` ${actionsW}px` : ''}`;
  const minWidth = 56 + header.length * colWidth + actionsW;

  const commit = () => {
    if (editing && onEdit) onEdit(editing.r, editing.c, editing.value);
    setEditing(null);
  };

  return (
    <div role="grid" aria-label={label} aria-rowcount={indices.length + 1} aria-colcount={header.length} className="overflow-hidden rounded-lg border border-line bg-surface">
      <div ref={scroller} className="overflow-auto" style={{ height }} onScroll={(e) => setScrollTop(e.currentTarget.scrollTop)}>
        <div style={{ minWidth }}>
          <div role="row" className="sticky top-0 z-10 grid border-b border-line bg-surface2 text-xs font-semibold" style={{ gridTemplateColumns: template }}>
            <div role="columnheader" className="px-2 py-2 text-right text-muted">
              #
            </div>
            {header.map((h, c) => (
              <div key={c} role="columnheader" aria-sort={sort?.col === c ? (sort.dir === 'asc' ? 'ascending' : 'descending') : undefined} className="flex min-w-0 items-center gap-1 border-l border-line px-2 py-1">
                <button onClick={() => onSort?.(c)} disabled={!onSort} className="flex min-w-0 flex-1 items-center gap-1 py-1 text-left hover:text-accent disabled:hover:text-inherit" title={onSort ? `Sort by ${h}` : h}>
                  <span className="truncate">{h}</span>
                  {sort?.col === c && (sort.dir === 'asc' ? <ArrowUp size={12} aria-hidden /> : <ArrowDown size={12} aria-hidden />)}
                </button>
                {headerExtra?.(c)}
              </div>
            ))}
            {rowActions && <div aria-hidden />}
          </div>
          <div style={{ height: indices.length * ROW_H, position: 'relative' }}>
            <div style={{ transform: `translateY(${start * ROW_H}px)` }}>
              {indices.slice(start, end).map((r, k) => (
                <div key={r} role="row" aria-rowindex={start + k + 2} className="grid border-b border-line text-[13px] hover:bg-surface2/60" style={{ gridTemplateColumns: template, height: ROW_H }}>
                  <div role="rowheader" className="px-2 py-1.5 text-right text-xs tabular-nums text-muted">
                    {start + k + 1}
                  </div>
                  {header.map((_, c) => {
                    const value = rows[r]?.[c] ?? '';
                    const isEditing = editing?.r === r && editing.c === c;
                    return (
                      <div
                        key={c}
                        role="gridcell"
                        tabIndex={onEdit ? 0 : -1}
                        onDoubleClick={() => onEdit && setEditing({ r, c, value })}
                        onKeyDown={(e) => {
                          if (onEdit && (e.key === 'Enter' || e.key === 'F2') && !isEditing) {
                            e.preventDefault();
                            setEditing({ r, c, value });
                          }
                        }}
                        className={clsx('min-w-0 border-l border-line px-2 py-1.5 focus:outline-none focus:ring-2 focus:ring-inset focus:ring-accent', !value && 'text-muted')}
                        title={value.length > 30 ? value : undefined}
                      >
                        {isEditing ? (
                          <input
                            autoFocus
                            aria-label={`Edit ${header[c]}, row ${start + k + 1}`}
                            className="-mx-1 -my-0.5 w-full rounded border border-accent bg-surface px-1 py-0.5 text-[13px] focus:outline-none"
                            value={editing.value}
                            onChange={(e) => setEditing({ ...editing, value: e.target.value })}
                            onBlur={commit}
                            onKeyDown={(e) => {
                              if (e.key === 'Enter') commit();
                              if (e.key === 'Escape') {
                                e.stopPropagation();
                                setEditing(null);
                              }
                            }}
                          />
                        ) : (
                          <span className="block truncate">{value}</span>
                        )}
                      </div>
                    );
                  })}
                  {rowActions && <div className="flex items-center justify-center border-l border-line">{rowActions(r)}</div>}
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
