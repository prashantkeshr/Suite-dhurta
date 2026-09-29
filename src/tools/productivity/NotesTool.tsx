import { useMemo, useState } from 'react';
import { Plus, Pin, PinOff, Trash2, Search, Download, Upload, FileDown, Check, Loader2 } from 'lucide-react';
import { clsx } from 'clsx';
import type { ToolDefinition } from '@/types/tool';
import { Button, Card } from '@/components/ui/primitives';
import { useSaver } from '@/components/tools/common';
import { toast } from '@/components/ui/Toast';
import { PickFileButton } from '@/tools/generators/ui';
import { usePersistentList, newId, readBackup } from './usePersistentList';

export interface Note {
  id: string;
  title: string;
  body: string;
  pinned: boolean;
  created: number;
  updated: number;
}

const titleOf = (n: Note) => n.title.trim() || n.body.trim().split('\n')[0].slice(0, 60) || 'Untitled note';
const fileSafe = (s: string) => s.replace(/[\\/:*?"<>|]+/g, '').trim().slice(0, 60) || 'note';

function when(t: number) {
  const d = new Date(t);
  const today = new Date();
  return d.toDateString() === today.toDateString() ? d.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' }) : d.toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: d.getFullYear() === today.getFullYear() ? undefined : 'numeric' });
}

export function isNote(x: unknown): x is Note {
  const n = x as Note;
  return !!n && typeof n.id === 'string' && typeof n.body === 'string';
}

export default function NotesTool(_: { tool: ToolDefinition }) {
  const { items: notes, setItems, loaded, saved } = usePersistentList<Note>('notes');
  const [activeId, setActiveId] = useState<string | null>(null);
  const [query, setQuery] = useState('');
  const save = useSaver();

  const sorted = useMemo(() => {
    const q = query.trim().toLowerCase();
    return notes.filter((n) => !q || n.title.toLowerCase().includes(q) || n.body.toLowerCase().includes(q)).sort((a, b) => Number(b.pinned) - Number(a.pinned) || b.updated - a.updated);
  }, [notes, query]);
  const active = notes.find((n) => n.id === activeId) ?? (activeId === null ? sorted[0] : undefined);

  const create = () => {
    const n: Note = { id: newId(), title: '', body: '', pinned: false, created: Date.now(), updated: Date.now() };
    setItems((l) => [n, ...l]);
    setActiveId(n.id);
    setQuery('');
  };
  const update = (id: string, patch: Partial<Note>) => setItems((l) => l.map((n) => (n.id === id ? { ...n, ...patch, updated: patch.pinned === undefined ? Date.now() : n.updated } : n)));
  const remove = (n: Note) => {
    if (!window.confirm(`Delete “${titleOf(n)}”? This cannot be undone.`)) return;
    setItems((l) => l.filter((x) => x.id !== n.id));
    setActiveId(null);
  };

  const words = active ? (active.body.trim().match(/\S+/g) ?? []).length : 0;

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <Button variant="primary" icon={<Plus size={16} />} onClick={create}>
          New note
        </Button>
        <div className="relative min-w-[180px] flex-1">
          <Search size={16} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted" aria-hidden />
          <input className="input pl-9" placeholder="Search notes" aria-label="Search notes" value={query} onChange={(e) => setQuery(e.target.value)} />
        </div>
        <Button
          icon={<Download size={16} />}
          disabled={!notes.length}
          onClick={() => save(new Blob([JSON.stringify({ app: 'Dhurta Suite', type: 'notes', exported: new Date().toISOString(), notes }, null, 2)], { type: 'application/json' }), `notes-backup-${new Date().toISOString().slice(0, 10)}.json`)}
        >
          Back up
        </Button>
        <PickFileButton
          accept="application/json,.json"
          onFile={async (f) => {
            try {
              const list = (await readBackup(f, 'notes')).filter(isNote);
              const have = new Set(notes.map((n) => n.id));
              const fresh = list.filter((n) => !have.has(n.id)).map((n) => ({ ...n, title: String(n.title ?? ''), pinned: !!n.pinned, created: Number(n.created) || Date.now(), updated: Number(n.updated) || Date.now() }));
              setItems((l) => [...fresh, ...l]);
              toast.success(`Restored ${fresh.length} note${fresh.length === 1 ? '' : 's'}${list.length > fresh.length ? ` (${list.length - fresh.length} already here)` : ''}`);
            } catch (err) {
              toast.error((err as Error).message);
            }
          }}
        >
          <Upload size={16} aria-hidden /> Restore
        </PickFileButton>
      </div>

      <div className="grid gap-3 md:grid-cols-[260px_1fr]">
        <Card className="max-h-[70vh] overflow-auto p-1.5">
          {!loaded ? (
            <p className="p-3 text-sm text-muted">Loading…</p>
          ) : sorted.length === 0 ? (
            <p className="p-3 text-sm text-muted">{notes.length ? 'No notes match your search.' : 'No notes yet. Create one — it is saved in this browser only.'}</p>
          ) : (
            <ul className="space-y-0.5" aria-label="Notes">
              {sorted.map((n) => (
                <li key={n.id}>
                  <button onClick={() => setActiveId(n.id)} aria-current={active?.id === n.id} className={clsx('w-full rounded-md px-2.5 py-2 text-left', active?.id === n.id ? 'bg-accent/10' : 'hover:bg-surface2')}>
                    <span className="flex items-center gap-1.5 truncate text-sm font-medium text-fg">
                      {n.pinned && <Pin size={12} className="shrink-0 text-accent" aria-label="Pinned" />}
                      <span className="truncate">{titleOf(n)}</span>
                    </span>
                    <span className="block truncate text-xs text-muted">
                      {when(n.updated)} · {n.body.replace(/\s+/g, ' ').slice(0, 60) || 'Empty'}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </Card>

        {active ? (
          <Card className="flex min-h-[60vh] flex-col">
            <div className="flex flex-wrap items-center gap-1 border-b border-line p-2">
              <input className="min-w-0 flex-1 bg-transparent px-2 text-lg font-semibold outline-none" placeholder="Title" aria-label="Note title" value={active.title} onChange={(e) => update(active.id, { title: e.target.value })} />
              <Button size="sm" variant="ghost" icon={active.pinned ? <PinOff size={14} /> : <Pin size={14} />} onClick={() => update(active.id, { pinned: !active.pinned })}>
                {active.pinned ? 'Unpin' : 'Pin'}
              </Button>
              <Button size="sm" variant="ghost" icon={<FileDown size={14} />} onClick={() => save(new Blob([`${active.title ? `# ${active.title}\n\n` : ''}${active.body}`], { type: 'text/markdown;charset=utf-8' }), `${fileSafe(titleOf(active))}.md`)}>
                .md
              </Button>
              <Button size="sm" variant="ghost" icon={<FileDown size={14} />} onClick={() => save(new Blob([`${active.title ? `${active.title}\n\n` : ''}${active.body}`], { type: 'text/plain;charset=utf-8' }), `${fileSafe(titleOf(active))}.txt`)}>
                .txt
              </Button>
              <Button size="sm" variant="ghost" icon={<Trash2 size={14} />} onClick={() => remove(active)} aria-label="Delete note">
                Delete
              </Button>
            </div>
            <textarea className="min-h-[50vh] flex-1 resize-none bg-transparent p-3 text-[15px] leading-relaxed outline-none" placeholder="Start writing…" aria-label="Note text" value={active.body} onChange={(e) => update(active.id, { body: e.target.value })} autoFocus={!active.body} />
            <div className="flex items-center justify-between border-t border-line px-3 py-1.5 text-xs text-muted">
              <span>
                {words.toLocaleString()} words · {active.body.length.toLocaleString()} characters
              </span>
              <span className="flex items-center gap-1" role="status">
                {saved ? <Check size={12} /> : <Loader2 size={12} className="animate-spin" />} {saved ? 'Saved on this device' : 'Saving…'}
              </span>
            </div>
          </Card>
        ) : (
          <Card className="flex min-h-[40vh] items-center justify-center p-6 text-center text-sm text-muted">Select a note or create a new one.</Card>
        )}
      </div>
      <p className="text-xs text-muted">Notes are stored only in this browser (IndexedDB) and never uploaded. They are not synced to other devices — use “Back up” to keep a copy.</p>
    </div>
  );
}
