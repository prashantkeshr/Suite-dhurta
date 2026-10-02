import { create } from 'zustand';

/**
 * The file tray: originals you opened and results you produced in this tab,
 * so any of them can be sent to another tool ("crop → compress → PDF").
 * Kept only in this tab's memory — never stored or uploaded — and emptied
 * when the tab closes.
 */
export interface TrayItem {
  id: string;
  file: File;
  origin: 'input' | 'result';
  /** Tool that produced a result. */
  toolId?: string;
  at: number;
}

const MAX_ITEMS = 40;
const MAX_BYTES = 750 * 1024 * 1024;

interface TrayState {
  items: TrayItem[];
  open: boolean;
  /** Item ids pre-selected when the tray opens. */
  focus: string[];
  add: (files: File[], origin: TrayItem['origin'], toolId?: string) => string[];
  remove: (id: string) => void;
  clear: () => void;
  show: (focus?: string[]) => void;
  hide: () => void;
}

const newId = () => crypto.randomUUID?.() ?? `${Date.now().toString(36)}${Math.random().toString(36).slice(2)}`;

/** Same file already in the tray (re-dropped or saved twice)? */
const same = (a: File, b: File) => a.name === b.name && a.size === b.size && a.type === b.type && a.lastModified === b.lastModified;

/** Keep the newest items within the count and memory limits. */
export function trim(items: TrayItem[], maxItems = MAX_ITEMS, maxBytes = MAX_BYTES): TrayItem[] {
  const out: TrayItem[] = [];
  let bytes = 0;
  for (const it of [...items].sort((a, b) => b.at - a.at)) {
    if (out.length >= maxItems || bytes + it.file.size > maxBytes) continue;
    out.push(it);
    bytes += it.file.size;
  }
  return out;
}

export const useTray = create<TrayState>((set, get) => ({
  items: [],
  open: false,
  focus: [],
  add(files, origin, toolId) {
    const ids: string[] = [];
    const items = [...get().items];
    for (const file of files) {
      if (!file.size) continue;
      const existing = items.find((it) => same(it.file, file));
      if (existing) {
        existing.at = Date.now();
        ids.push(existing.id);
        continue;
      }
      const it: TrayItem = { id: newId(), file, origin, toolId, at: Date.now() };
      items.push(it);
      ids.push(it.id);
    }
    set({ items: trim(items) });
    return ids;
  },
  remove: (id) => set({ items: get().items.filter((it) => it.id !== id) }),
  clear: () => set({ items: [], focus: [] }),
  show: (focus = []) => set({ open: true, focus }),
  hide: () => set({ open: false }),
}));

/** Turn a generated blob into a File so tools treat it like any opened file. */
export const asFile = (blob: Blob, name: string) => (blob instanceof File && blob.name === name ? blob : new File([blob], name, { type: blob.type, lastModified: Date.now() }));

/** Tool id of the page currently open, if any. */
export const currentToolId = () => /\/tools\/([\w-]+)/.exec(location.pathname)?.[1];
