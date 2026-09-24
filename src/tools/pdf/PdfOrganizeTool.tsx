import { useEffect, useRef, useState } from 'react';
import { clsx } from 'clsx';
import { ArrowLeft, ArrowRight, Copy, FilePlus2, RotateCw, Trash2, Undo2, Save } from 'lucide-react';
import type { ToolDefinition } from '@/types/tool';
import { useStore } from '@/storage/store';
import { outputName } from '@/utils/filename';
import { Button, Card } from '@/components/ui/primitives';
import { ErrorState } from '@/components/ui/states';
import { useJob } from './useJob';
import { loadPdf } from './engine';
import { buildFromPlan, type PlanItem } from './stamp';
import { usePdfSource, PdfSourceHeader, PdfResult } from './shared';
import { PdfThumbnail } from './PdfThumbnail';

interface Item extends PlanItem {
  key: number;
}

let nextKey = 1;
const initialPlan = (n: number): Item[] => Array.from({ length: n }, (_, i) => ({ key: nextKey++, src: i, rotate: 0 }));

function IconBtn({ label, onClick, disabled, children }: { label: string; onClick: () => void; disabled?: boolean; children: React.ReactNode }) {
  return (
    <button onClick={onClick} disabled={disabled} aria-label={label} title={label} className="flex h-8 w-8 items-center justify-center rounded text-muted hover:bg-surface2 hover:text-fg disabled:opacity-30">
      {children}
    </button>
  );
}

export default function PdfOrganizeTool({ tool, initialFiles }: { tool: ToolDefinition; initialFiles?: File[] }) {
  const src = usePdfSource(initialFiles);
  const [plan, setPlan] = useState<Item[]>([]);
  const [drag, setDrag] = useState<number | null>(null);
  const [over, setOver] = useState<number | null>(null);
  const job = useJob<Blob>();
  const addHistory = useStore((s) => s.addHistory);
  const loadedFor = useRef<File | null>(null);

  useEffect(() => {
    if (src.source && loadedFor.current !== src.source.file) {
      loadedFor.current = src.source.file;
      setPlan(initialPlan(src.source.pages.length));
    }
  }, [src.source]);

  const update = (next: Item[]) => {
    setPlan(next);
    job.reset();
  };
  const move = (from: number, to: number) => {
    if (to < 0 || to >= plan.length || from === to) return;
    const next = [...plan];
    const [x] = next.splice(from, 1);
    next.splice(to, 0, x);
    update(next);
  };
  const changed = plan.length !== (src.source?.pages.length ?? 0) || plan.some((p, i) => p.src !== i || p.rotate !== 0);

  const save = async () => {
    if (!src.source) return;
    const file = src.source.file;
    const r = await job.run(async (_s, report) => {
      report(null, 'Rebuilding document…');
      const { doc } = await loadPdf(file);
      const out = await buildFromPlan(doc, plan);
      report(null, 'Saving…');
      return new Blob([(await out.save({ useObjectStreams: true })) as BlobPart], { type: 'application/pdf' });
    });
    if (r) addHistory(tool.id, `Reorganised into ${plan.length} pages`);
  };

  return (
    <div className="space-y-4">
      <PdfSourceHeader tool={tool} src={src}>
        {changed && (
          <Button size="sm" variant="ghost" icon={<Undo2 size={14} />} onClick={() => update(initialPlan(src.source!.pages.length))}>
            Reset
          </Button>
        )}
      </PdfSourceHeader>
      {src.source && (
        <div className="grid gap-4 lg:grid-cols-[1fr_300px]">
          <Card className="p-3">
            <p className="mb-3 text-xs text-muted">Drag pages to reorder, or use the buttons. {plan.length} page{plan.length === 1 ? '' : 's'} in the new document.</p>
            <ol className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-4" aria-label="Pages in order">
              {plan.map((item, i) => (
                <li
                  key={item.key}
                  draggable
                  onDragStart={(e) => {
                    setDrag(i);
                    e.dataTransfer.effectAllowed = 'move';
                    e.dataTransfer.setData('text/plain', String(i));
                  }}
                  onDragOver={(e) => {
                    if (drag === null) return;
                    e.preventDefault();
                    setOver(i);
                  }}
                  onDrop={(e) => {
                    e.preventDefault();
                    if (drag !== null) move(drag, i);
                    setDrag(null);
                    setOver(null);
                  }}
                  onDragEnd={() => (setDrag(null), setOver(null))}
                  className={clsx('rounded-md border bg-surface p-2', drag === i && 'opacity-40', over === i && drag !== i ? 'border-accent' : 'border-line')}
                >
                  {item.src === null ? (
                    <div className="flex aspect-square items-center justify-center">
                      <div className="flex h-[85%] w-[60%] items-center justify-center border border-line bg-white text-xs text-neutral-400" style={item.rotate % 180 ? { transform: 'rotate(90deg)' } : undefined}>
                        Blank
                      </div>
                    </div>
                  ) : src.preview ? (
                    <PdfThumbnail doc={src.preview} index={item.src} rotate={item.rotate} />
                  ) : (
                    <div className="flex aspect-square items-center justify-center text-xs text-muted">Page {item.src + 1}</div>
                  )}
                  <p className="mt-1 text-center text-xs">
                    <span className="font-medium">{i + 1}</span>
                    <span className="text-muted"> · {item.src === null ? 'blank' : `was ${item.src + 1}`}{item.rotate ? ` · ${item.rotate}°` : ''}</span>
                  </p>
                  <div className="mt-1 flex flex-wrap justify-center">
                    <IconBtn label={`Move page ${i + 1} left`} onClick={() => move(i, i - 1)} disabled={i === 0}>
                      <ArrowLeft size={14} />
                    </IconBtn>
                    <IconBtn label={`Rotate page ${i + 1}`} onClick={() => update(plan.map((p, k) => (k === i ? { ...p, rotate: ((p.rotate + 90) % 360) as PlanItem['rotate'] } : p)))}>
                      <RotateCw size={14} />
                    </IconBtn>
                    <IconBtn label={`Duplicate page ${i + 1}`} onClick={() => update([...plan.slice(0, i + 1), { ...item, key: nextKey++ }, ...plan.slice(i + 1)])}>
                      <Copy size={14} />
                    </IconBtn>
                    <IconBtn label={`Insert blank page after ${i + 1}`} onClick={() => update([...plan.slice(0, i + 1), { key: nextKey++, src: null, rotate: 0 }, ...plan.slice(i + 1)])}>
                      <FilePlus2 size={14} />
                    </IconBtn>
                    <IconBtn label={`Remove page ${i + 1}`} onClick={() => update(plan.filter((_, k) => k !== i))} disabled={plan.length <= 1}>
                      <Trash2 size={14} />
                    </IconBtn>
                    <IconBtn label={`Move page ${i + 1} right`} onClick={() => move(i, i + 1)} disabled={i === plan.length - 1}>
                      <ArrowRight size={14} />
                    </IconBtn>
                  </div>
                </li>
              ))}
            </ol>
          </Card>
          <Card className="h-fit space-y-3 p-4 lg:sticky lg:top-20">
            {!job.running && (
              <Button variant="primary" size="lg" className="w-full justify-center" disabled={!changed || plan.length === 0} onClick={save} icon={<Save size={16} />}>
                Save new PDF
              </Button>
            )}
            {!changed && !job.result && <p className="text-xs text-muted">Make a change to enable saving.</p>}
            <PdfResult running={job.running} progress={job.progress} step={job.step} onCancel={job.cancel} result={job.result} filename={outputName(src.source.file.name, 'organized', 'pdf')} />
          </Card>
        </div>
      )}
      {job.error != null && <ErrorState error={job.error} onRetry={save} />}
    </div>
  );
}
