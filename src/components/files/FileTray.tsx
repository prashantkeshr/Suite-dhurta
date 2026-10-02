import { useEffect, useMemo, useState } from 'react';
import { Layers, Trash2, Download, FileQuestion, X } from 'lucide-react';
import { clsx } from 'clsx';
import { useTray, type TrayItem } from '@/filesystem/tray';
import { getTool } from '@/tools/registry';
import { saveFile } from '@/conversion/download';
import { useStore } from '@/storage/store';
import { useObjectUrl } from '@/hooks/useObjectUrl';
import { formatBytes } from '@/utils/format';
import { Drawer } from '@/components/ui/Dialog';
import { Button } from '@/components/ui/primitives';
import { FileActions } from './FileActions';

/** Header button: shows how many files are in the tray. Hidden while it is empty. */
export function FileTrayButton() {
  const count = useTray((s) => s.items.length);
  const show = useTray((s) => s.show);
  if (!count) return null;
  return (
    <button onClick={() => show()} className="relative flex h-10 items-center gap-1.5 rounded-md px-2.5 text-sm text-muted hover:bg-surface2 hover:text-fg" title="Your files — reuse them in another tool" aria-label={`Your files: ${count}`}>
      <Layers size={18} aria-hidden />
      <span className="hidden sm:inline">Files</span>
      <span className="absolute right-0.5 top-1 min-w-[18px] rounded-full bg-accent px-1 text-center text-[10.5px] font-semibold leading-[18px] text-accent-fg">{count}</span>
    </button>
  );
}

function Thumb({ file }: { file: File }) {
  const isImage = /^image\/(png|jpe?g|webp|gif|bmp|avif|svg\+xml)$/.test(file.type);
  const url = useObjectUrl(isImage ? file : null);
  return (
    <div className="checker flex h-11 w-11 shrink-0 items-center justify-center overflow-hidden rounded-md border border-line">
      {url ? <img src={url} alt="" className="max-h-full max-w-full object-contain" /> : <FileQuestion size={18} className="text-muted" aria-hidden />}
    </div>
  );
}

function Row({ item, selected, onToggle }: { item: TrayItem; selected: boolean; onToggle: () => void }) {
  const remove = useTray((s) => s.remove);
  const useDialog = useStore((s) => s.settings.useSaveDialog);
  const tool = item.toolId ? getTool(item.toolId) : undefined;
  return (
    <li className={clsx('flex items-center gap-2.5 rounded-md px-2 py-1.5', selected && 'bg-accent/10')}>
      <input type="checkbox" checked={selected} onChange={onToggle} className="h-4 w-4 shrink-0 cursor-pointer accent-[rgb(var(--accent))]" aria-label={`Select ${item.file.name}`} />
      <button onClick={onToggle} className="flex min-w-0 flex-1 items-center gap-2.5 text-left">
        <Thumb file={item.file} />
        <span className="min-w-0">
          <span className="block truncate text-sm font-medium text-fg" title={item.file.name}>
            {item.file.name}
          </span>
          <span className="block truncate text-xs text-muted">
            {formatBytes(item.file.size)} · {item.origin === 'input' ? 'Opened' : `Result${tool ? ` of ${tool.name}` : ''}`}
          </span>
        </span>
      </button>
      <button onClick={() => void saveFile(item.file, item.file.name, { useDialog })} className="rounded p-1.5 text-muted hover:bg-surface2 hover:text-fg" aria-label={`Download ${item.file.name}`} title="Download">
        <Download size={15} />
      </button>
      <button onClick={() => remove(item.id)} className="rounded p-1.5 text-muted hover:bg-surface2 hover:text-fg" aria-label={`Remove ${item.file.name} from the list`} title="Remove from list">
        <X size={15} />
      </button>
    </li>
  );
}

/** Drawer listing originals and results; pick files and continue in another tool. */
export function FileTray() {
  const { items, open, focus, hide, clear } = useTray();
  const [selected, setSelected] = useState<string[]>([]);

  useEffect(() => {
    if (!open) return;
    const ids = new Set(items.map((i) => i.id));
    const pre = focus.filter((id) => ids.has(id));
    setSelected(pre.length ? pre : items.length ? [[...items].sort((a, b) => b.at - a.at)[0].id] : []);
  }, [open]); // eslint-disable-line react-hooks/exhaustive-deps

  const sorted = useMemo(() => [...items].sort((a, b) => b.at - a.at), [items]);
  const files = useMemo(() => sorted.filter((i) => selected.includes(i.id)).map((i) => i.file), [sorted, selected]);
  const toggle = (id: string) => setSelected((s) => (s.includes(id) ? s.filter((x) => x !== id) : [...s, id]));

  return (
    <Drawer open={open} onClose={hide} title="Your files" side="right">
      <div className="space-y-4 p-3">
        <p className="px-1 text-xs text-muted">Files you opened and results you made in this tab. Pick one or more and choose the next tool. They stay only in this tab’s memory and are cleared when you close it.</p>
        {sorted.length === 0 ? (
          <p className="px-1 py-6 text-center text-sm text-muted">No files yet.</p>
        ) : (
          <>
            <div className="flex items-center justify-between px-1">
              <button className="text-xs font-medium text-accent hover:underline" onClick={() => setSelected(selected.length === sorted.length ? [] : sorted.map((i) => i.id))}>
                {selected.length === sorted.length ? 'Select none' : 'Select all'}
              </button>
              <Button
                size="sm"
                variant="ghost"
                icon={<Trash2 size={14} />}
                onClick={() => {
                  clear();
                  setSelected([]);
                }}
              >
                Clear list
              </Button>
            </div>
            <ul className="space-y-0.5" aria-label="Files">
              {sorted.map((item) => (
                <Row key={item.id} item={item} selected={selected.includes(item.id)} onToggle={() => toggle(item.id)} />
              ))}
            </ul>
            <div className="border-t border-line pt-3">
              {files.length ? (
                <>
                  <p className="mb-2 px-1 text-sm font-semibold">
                    Continue with {files.length === 1 ? 'this file' : `${files.length} files`}
                  </p>
                  <FileActions files={files} onClear={() => setSelected([])} onOpen={hide} compact />
                </>
              ) : (
                <p className="px-1 text-sm text-muted">Select a file to see what you can do with it next.</p>
              )}
            </div>
          </>
        )}
      </div>
    </Drawer>
  );
}
