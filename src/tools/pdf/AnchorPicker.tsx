import { clsx } from 'clsx';
import { ANCHORS, type Anchor } from './stamp';

const LABEL: Record<Anchor, string> = {
  'top-left': 'Top left',
  'top-center': 'Top centre',
  'top-right': 'Top right',
  'middle-left': 'Middle left',
  center: 'Centre',
  'middle-right': 'Middle right',
  'bottom-left': 'Bottom left',
  'bottom-center': 'Bottom centre',
  'bottom-right': 'Bottom right',
};

/** 3×3 position picker, keyboard accessible as a radio group. */
export function AnchorPicker({ value, onChange, label = 'Position' }: { value: Anchor; onChange: (a: Anchor) => void; label?: string }) {
  return (
    <div>
      <span className="label">{label}</span>
      <div role="radiogroup" aria-label={label} className="grid w-[132px] grid-cols-3 gap-1 rounded-md border border-line bg-surface2 p-1">
        {ANCHORS.map((a) => (
          <button
            key={a}
            role="radio"
            aria-checked={value === a}
            aria-label={LABEL[a]}
            title={LABEL[a]}
            onClick={() => onChange(a)}
            className={clsx('flex h-9 items-center justify-center rounded', value === a ? 'bg-accent' : 'hover:bg-surface')}
          >
            <span className={clsx('h-2 w-2 rounded-full', value === a ? 'bg-accent-fg' : 'bg-muted/60')} />
          </button>
        ))}
      </div>
    </div>
  );
}
