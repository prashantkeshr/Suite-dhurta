import { useMemo, useState, type FormEvent } from 'react';
import { Plus, Trash2, Download, Upload, CalendarClock, Flag } from 'lucide-react';
import { clsx } from 'clsx';
import type { ToolDefinition } from '@/types/tool';
import { Badge, Button, Card, Segmented } from '@/components/ui/primitives';
import { useSaver } from '@/components/tools/common';
import { toast } from '@/components/ui/Toast';
import { PickFileButton } from '@/tools/generators/ui';
import { usePersistentList, newId, readBackup } from './usePersistentList';
import { sortTasks, isOverdue, type Task, type Priority } from './tasks';

type Filter = 'active' | 'today' | 'done' | 'all';

const PRIORITY_LABEL: Record<Priority, string> = { high: 'High', normal: 'Normal', low: 'Low' };
const localToday = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};
const csvCell = (s: string) => (/[",\n]/.test(s) || /^[=+\-@]/.test(s) ? `"${(/^[=+\-@]/.test(s) ? `'${s}` : s).replace(/"/g, '""')}"` : s);

export default function TodoTool(_: { tool: ToolDefinition }) {
  const { items: tasks, setItems, loaded, saved } = usePersistentList<Task>('tasks');
  const [text, setText] = useState('');
  const [due, setDue] = useState('');
  const [priority, setPriority] = useState<Priority>('normal');
  const [filter, setFilter] = useState<Filter>('active');
  const [editing, setEditing] = useState<string | null>(null);
  const save = useSaver();
  const today = localToday();

  const shown = useMemo(() => {
    const list = tasks.filter((t) => (filter === 'active' ? !t.done : filter === 'done' ? t.done : filter === 'today' ? !t.done && !!t.due && t.due <= today : true));
    return sortTasks(list);
  }, [tasks, filter, today]);

  const counts = {
    active: tasks.filter((t) => !t.done).length,
    today: tasks.filter((t) => !t.done && t.due && t.due <= today).length,
    done: tasks.filter((t) => t.done).length,
  };

  const add = (e: FormEvent) => {
    e.preventDefault();
    const value = text.trim();
    if (!value) return;
    setItems((l) => [{ id: newId(), text: value, done: false, due: due || undefined, priority, created: Date.now() }, ...l]);
    setText('');
    setDue('');
    setPriority('normal');
    if (filter === 'done') setFilter('active');
  };
  const update = (id: string, patch: Partial<Task>) => setItems((l) => l.map((t) => (t.id === id ? { ...t, ...patch } : t)));

  const csv = ['Task,Done,Due,Priority,Created', ...tasks.map((t) => [csvCell(t.text), t.done ? 'yes' : 'no', t.due ?? '', t.priority, new Date(t.created).toISOString()].join(','))].join('\n');

  return (
    <div className="space-y-3">
      <Card as="section" className="p-3">
        <form onSubmit={add} className="flex flex-wrap items-end gap-2">
          <div className="min-w-[200px] flex-[3]">
            <label htmlFor="todo-text" className="label">
              New task
            </label>
            <input id="todo-text" className="input" placeholder="What needs doing?" value={text} onChange={(e) => setText(e.target.value)} maxLength={500} />
          </div>
          <div className="min-w-[150px] flex-1">
            <label htmlFor="todo-due" className="label">
              Due (optional)
            </label>
            <input id="todo-due" type="date" className="input" value={due} onChange={(e) => setDue(e.target.value)} />
          </div>
          <div className="min-w-[120px]">
            <label htmlFor="todo-pri" className="label">
              Priority
            </label>
            <select id="todo-pri" className="input pr-8" value={priority} onChange={(e) => setPriority(e.target.value as Priority)}>
              <option value="high">High</option>
              <option value="normal">Normal</option>
              <option value="low">Low</option>
            </select>
          </div>
          <Button type="submit" variant="primary" icon={<Plus size={16} />} disabled={!text.trim()}>
            Add
          </Button>
        </form>
      </Card>

      <div className="flex flex-wrap items-end justify-between gap-2">
        <Segmented
          label="Show"
          value={filter}
          onChange={setFilter}
          options={[
            { value: 'active', label: `To do (${counts.active})` },
            { value: 'today', label: `Due / overdue (${counts.today})` },
            { value: 'done', label: `Done (${counts.done})` },
            { value: 'all', label: 'All' },
          ]}
        />
        <div className="flex flex-wrap gap-2">
          {counts.done > 0 && (
            <Button
              size="sm"
              variant="ghost"
              icon={<Trash2 size={14} />}
              onClick={() => {
                if (window.confirm(`Delete ${counts.done} completed task${counts.done === 1 ? '' : 's'}?`)) setItems((l) => l.filter((t) => !t.done));
              }}
            >
              Clear completed
            </Button>
          )}
          <Button size="sm" icon={<Download size={14} />} disabled={!tasks.length} onClick={() => save(new Blob([JSON.stringify({ app: 'Dhurta Suite', type: 'tasks', exported: new Date().toISOString(), tasks }, null, 2)], { type: 'application/json' }), `tasks-backup-${today}.json`)}>
            Back up
          </Button>
          <Button size="sm" icon={<Download size={14} />} disabled={!tasks.length} onClick={() => save(new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8' }), `tasks-${today}.csv`)}>
            CSV
          </Button>
          <PickFileButton
            accept="application/json,.json"
            className="h-8 px-2.5 text-[13px]"
            onFile={async (f) => {
              try {
                const list = (await readBackup(f, 'tasks')).filter((x): x is Task => !!x && typeof (x as Task).id === 'string' && typeof (x as Task).text === 'string');
                const have = new Set(tasks.map((t) => t.id));
                const fresh = list.filter((t) => !have.has(t.id)).map((t) => ({ ...t, done: !!t.done, priority: (['high', 'normal', 'low'] as Priority[]).includes(t.priority) ? t.priority : 'normal', created: Number(t.created) || Date.now() }));
                setItems((l) => [...fresh, ...l]);
                toast.success(`Restored ${fresh.length} task${fresh.length === 1 ? '' : 's'}`);
              } catch (err) {
                toast.error((err as Error).message);
              }
            }}
          >
            <Upload size={14} aria-hidden /> Restore
          </PickFileButton>
        </div>
      </div>

      <Card>
        {!loaded ? (
          <p className="p-4 text-sm text-muted">Loading…</p>
        ) : shown.length === 0 ? (
          <p className="p-6 text-center text-sm text-muted">{tasks.length === 0 ? 'No tasks yet. Add your first one above.' : filter === 'done' ? 'Nothing completed yet.' : 'Nothing here — well done!'}</p>
        ) : (
          <ul className="divide-y divide-line" aria-label="Tasks">
            {shown.map((t) => {
              const overdue = isOverdue(t, today);
              return (
                <li key={t.id} className="flex items-start gap-3 px-3 py-2.5">
                  <input type="checkbox" className="mt-1 h-5 w-5 shrink-0 cursor-pointer accent-[rgb(var(--accent))]" checked={t.done} onChange={(e) => update(t.id, { done: e.target.checked, doneAt: e.target.checked ? Date.now() : undefined })} aria-label={`Mark “${t.text}” as ${t.done ? 'not done' : 'done'}`} />
                  <div className="min-w-0 flex-1">
                    {editing === t.id ? (
                      <input
                        className="input h-8"
                        defaultValue={t.text}
                        autoFocus
                        aria-label="Edit task"
                        onBlur={(e) => {
                          if (e.target.value.trim()) update(t.id, { text: e.target.value.trim() });
                          setEditing(null);
                        }}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') (e.target as HTMLInputElement).blur();
                          if (e.key === 'Escape') setEditing(null);
                        }}
                      />
                    ) : (
                      <button className={clsx('block w-full text-left text-[15px]', t.done ? 'text-muted line-through' : 'text-fg')} onClick={() => setEditing(t.id)} title="Edit">
                        {t.text}
                      </button>
                    )}
                    <div className="mt-1 flex flex-wrap items-center gap-2 text-xs">
                      {t.priority !== 'normal' && (
                        <Badge tone={t.priority === 'high' ? 'error' : 'neutral'}>
                          <Flag size={11} className="mr-1 inline" aria-hidden />
                          {PRIORITY_LABEL[t.priority]}
                        </Badge>
                      )}
                      <label className={clsx('inline-flex items-center gap-1', overdue ? 'font-medium text-error' : 'text-muted')}>
                        <CalendarClock size={12} aria-hidden />
                        <input type="date" className="bg-transparent outline-none" value={t.due ?? ''} onChange={(e) => update(t.id, { due: e.target.value || undefined })} aria-label="Due date" />
                        {overdue && <span>Overdue</span>}
                        {!t.done && t.due === today && <span className="text-warning">Today</span>}
                      </label>
                    </div>
                  </div>
                  <Button size="sm" variant="ghost" aria-label={`Delete “${t.text}”`} onClick={() => setItems((l) => l.filter((x) => x.id !== t.id))}>
                    <Trash2 size={14} />
                  </Button>
                </li>
              );
            })}
          </ul>
        )}
      </Card>
      <p className="text-xs text-muted" role="status">
        {saved ? 'Saved on this device.' : 'Saving…'} Tasks are stored only in this browser and never uploaded — use “Back up” to keep a copy or move them to another device.
      </p>
    </div>
  );
}
