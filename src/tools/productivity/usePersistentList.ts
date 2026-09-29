import { useCallback, useEffect, useRef, useState } from 'react';
import { kvGet, kvSet } from '@/storage/kv';

const channel = typeof BroadcastChannel !== 'undefined' ? new BroadcastChannel('dhurta-suite-data') : null;

/** Ask once for persistent storage so the browser does not evict notes under pressure. */
let persistAsked = false;
function askPersist() {
  if (persistAsked) return;
  persistAsked = true;
  void navigator.storage?.persist?.().catch(() => undefined);
}

/**
 * A list stored in IndexedDB under `key`. Saves are debounced and flushed when
 * the page is hidden; other open tabs reload when this one saves.
 */
export function usePersistentList<T>(key: string) {
  const [items, setItemsState] = useState<T[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [saved, setSaved] = useState(true);
  const latest = useRef<T[]>([]);
  const timer = useRef(0);
  const dirty = useRef(false);

  const flush = useCallback(async () => {
    if (!dirty.current) return;
    clearTimeout(timer.current);
    dirty.current = false;
    await kvSet(key, latest.current);
    setSaved(true);
    channel?.postMessage({ key });
  }, [key]);

  useEffect(() => {
    let alive = true;
    const load = () =>
      kvGet<T[]>(key).then((v) => {
        if (!alive || dirty.current) return;
        latest.current = v ?? [];
        setItemsState(latest.current);
        setLoaded(true);
      });
    void load();
    const onMsg = (e: MessageEvent) => e.data?.key === key && void load();
    channel?.addEventListener('message', onMsg);
    const onHide = () => void flush();
    window.addEventListener('pagehide', onHide);
    document.addEventListener('visibilitychange', onHide);
    return () => {
      alive = false;
      channel?.removeEventListener('message', onMsg);
      window.removeEventListener('pagehide', onHide);
      document.removeEventListener('visibilitychange', onHide);
      void flush();
    };
  }, [key, flush]);

  const setItems = useCallback(
    (update: T[] | ((prev: T[]) => T[])) => {
      const next = typeof update === 'function' ? (update as (p: T[]) => T[])(latest.current) : update;
      latest.current = next;
      setItemsState(next);
      dirty.current = true;
      setSaved(false);
      askPersist();
      clearTimeout(timer.current);
      timer.current = window.setTimeout(() => void flush(), 400);
    },
    [flush],
  );

  return { items, setItems, loaded, saved };
}

export const newId = () => crypto.randomUUID?.() ?? `${Date.now().toString(36)}${Math.random().toString(36).slice(2)}`;

/** Read a JSON backup file and return its array (or throw a friendly error). */
export async function readBackup(file: File, field: string): Promise<unknown[]> {
  let data: unknown;
  try {
    data = JSON.parse(await file.text());
  } catch {
    throw new Error('That file is not valid JSON.');
  }
  const list = Array.isArray(data) ? data : (data as Record<string, unknown>)?.[field];
  if (!Array.isArray(list)) throw new Error(`No ${field} were found in that file.`);
  return list;
}
