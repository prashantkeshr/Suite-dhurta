import { useState, type ReactNode } from 'react';
import { clsx } from 'clsx';
import { ArrowDown, ArrowUp, GripVertical, X } from 'lucide-react';
import { t } from '@/i18n';

/**
 * A list the user can reorder by dragging (mouse) or with the arrow buttons
 * (keyboard and touch). Items are identified by index.
 */
export function SortableFileList<T>({
  items,
  onChange,
  render,
  label,
}: {
  items: T[];
  onChange: (items: T[]) => void;
  render: (item: T, index: number) => ReactNode;
  label: (item: T) => string;
}) {
  const [dragIndex, setDragIndex] = useState<number | null>(null);
  const [overIndex, setOverIndex] = useState<number | null>(null);

  const move = (from: number, to: number) => {
    if (to < 0 || to >= items.length || from === to) return;
    const next = [...items];
    const [x] = next.splice(from, 1);
    next.splice(to, 0, x);
    onChange(next);
  };

  return (
    <ol className="divide-y divide-line" aria-label="Files in order">
      {items.map((item, i) => (
        <li
          key={i}
          draggable
          onDragStart={(e) => {
            setDragIndex(i);
            e.dataTransfer.effectAllowed = 'move';
            e.dataTransfer.setData('text/plain', String(i));
          }}
          onDragOver={(e) => {
            if (dragIndex === null) return;
            e.preventDefault();
            e.stopPropagation();
            setOverIndex(i);
          }}
          onDrop={(e) => {
            if (dragIndex === null) return;
            e.preventDefault();
            e.stopPropagation();
            move(dragIndex, i);
            setDragIndex(null);
            setOverIndex(null);
          }}
          onDragEnd={() => {
            setDragIndex(null);
            setOverIndex(null);
          }}
          className={clsx('flex items-center gap-2 px-3 py-2.5', dragIndex === i && 'opacity-50', overIndex === i && dragIndex !== i && 'bg-accent/5')}
        >
          <GripVertical size={16} className="hidden shrink-0 cursor-grab text-muted sm:block" aria-hidden />
          <span className="w-6 shrink-0 text-right text-xs tabular-nums text-muted">{i + 1}</span>
          <div className="min-w-0 flex-1">{render(item, i)}</div>
          <div className="flex shrink-0">
            <button onClick={() => move(i, i - 1)} disabled={i === 0} aria-label={`Move ${label(item)} up`} className="flex h-9 w-8 items-center justify-center rounded text-muted hover:bg-surface2 hover:text-fg disabled:opacity-30">
              <ArrowUp size={15} />
            </button>
            <button onClick={() => move(i, i + 1)} disabled={i === items.length - 1} aria-label={`Move ${label(item)} down`} className="flex h-9 w-8 items-center justify-center rounded text-muted hover:bg-surface2 hover:text-fg disabled:opacity-30">
              <ArrowDown size={15} />
            </button>
            <button onClick={() => onChange(items.filter((_, j) => j !== i))} aria-label={`${t('action.remove')} ${label(item)}`} className="flex h-9 w-8 items-center justify-center rounded text-muted hover:bg-surface2 hover:text-fg">
              <X size={15} />
            </button>
          </div>
        </li>
      ))}
    </ol>
  );
}
