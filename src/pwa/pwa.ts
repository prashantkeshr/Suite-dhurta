/**
 * Progressive Web App support: service worker registration, install prompt,
 * online/offline state, updates, and saving tools for offline use.
 *
 * The service worker (built from scripts/sw-template.js) only ever caches the
 * app's own code and pages — never the files a user processes.
 */
import { create } from 'zustand';
import { toast } from '@/components/ui/Toast';
import { useHandoff } from '@/filesystem/handoff';
import { filesFor, isToolReady, type OfflineManifest } from './offlineFiles';

interface BeforeInstallPromptEvent extends Event {
  prompt(): Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

export type SwStatus = 'unsupported' | 'dev' | 'starting' | 'active' | 'error';

interface PwaState {
  online: boolean;
  canInstall: boolean;
  installed: boolean;
  updateReady: boolean;
  sw: SwStatus;
  /** Bumped whenever cached files change, so status badges re-check. */
  cacheTick: number;
}

const BASE = import.meta.env.BASE_URL;
const ASSET_CACHE = 'ds-assets';
const SHARE_CACHE = 'ds-share';
const META_CACHE = 'ds-meta';
const SAVE_ALL_KEY = `${BASE}__meta/save-all`;

export const isStandalone = () =>
  typeof window !== 'undefined' && (matchMedia('(display-mode: standalone)').matches || (navigator as Navigator & { standalone?: boolean }).standalone === true);
export const isIos = () => /iphone|ipad|ipod/i.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
export const offlineSupported = () => typeof window !== 'undefined' && 'serviceWorker' in navigator && 'caches' in window;

export const usePwa = create<PwaState>(() => ({
  online: typeof navigator === 'undefined' ? true : navigator.onLine,
  canInstall: false,
  installed: isStandalone(),
  updateReady: false,
  sw: !offlineSupported() ? 'unsupported' : import.meta.env.PROD ? 'starting' : 'dev',
  cacheTick: 0,
}));

let deferredPrompt: BeforeInstallPromptEvent | null = null;
let waiting: ServiceWorker | null = null;
let updateRequested = false;

function announceUpdate(worker: ServiceWorker) {
  waiting = worker;
  usePwa.setState({ updateReady: true });
  toast.info('A new version of Dhurta Suite is ready', 'Reload to update. Your settings, notes and tasks are kept.', { label: 'Reload', onClick: applyUpdate }, true);
}

export function applyUpdate() {
  updateRequested = true;
  if (waiting) waiting.postMessage('SKIP_WAITING');
  else location.reload();
}

export async function promptInstall(): Promise<'accepted' | 'dismissed' | 'unavailable'> {
  if (!deferredPrompt) return 'unavailable';
  await deferredPrompt.prompt();
  const { outcome } = await deferredPrompt.userChoice;
  deferredPrompt = null;
  usePwa.setState({ canInstall: false });
  return outcome;
}

/* ---------- Files opened with / shared to the installed app ---------- */

async function receiveSharedFiles() {
  const params = new URLSearchParams(location.search);
  if (!params.has('share') && !params.has('launch')) return;
  history.replaceState(null, '', location.pathname + location.hash);
  if (!params.has('share') || !('caches' in window)) return;
  try {
    const cache = await caches.open(SHARE_CACHE);
    const count = Number(await (await cache.match(`${BASE}__share/count`))?.text()) || 0;
    const files: File[] = [];
    for (let i = 0; i < count; i++) {
      const r = await cache.match(`${BASE}__share/${i}`);
      if (r) files.push(new File([await r.blob()], decodeURIComponent(r.headers.get('X-File-Name') ?? `shared-${i + 1}`), { type: r.headers.get('Content-Type') ?? '' }));
    }
    await caches.delete(SHARE_CACHE); // shared files are kept only until the app has read them
    if (files.length) useHandoff.getState().receive(files);
    else toast.warning('Nothing was shared', 'Only files can be shared to Dhurta Suite.');
  } catch {
    toast.error('The shared files could not be opened.');
  }
}

function listenForLaunchedFiles() {
  const lq = (window as unknown as { launchQueue?: { setConsumer(cb: (p: { files: FileSystemFileHandle[] }) => void): void } }).launchQueue;
  lq?.setConsumer(async ({ files }) => {
    if (!files?.length) return;
    const list = await Promise.all(files.map((h) => h.getFile()));
    useHandoff.getState().receive(list);
  });
}

/* ---------- Registration ---------- */

export function initPwa() {
  addEventListener('online', () => usePwa.setState({ online: true }));
  addEventListener('offline', () => usePwa.setState({ online: false }));
  addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault(); // show our own button instead of the browser's mini bar
    deferredPrompt = e as BeforeInstallPromptEvent;
    usePwa.setState({ canInstall: true });
  });
  addEventListener('appinstalled', () => {
    deferredPrompt = null;
    usePwa.setState({ canInstall: false, installed: true });
    toast.success('Dhurta Suite is installed', 'Open it from your home screen or app list.');
  });
  listenForLaunchedFiles();
  void receiveSharedFiles();

  if (!offlineSupported() || !import.meta.env.PROD) return;
  const hadController = !!navigator.serviceWorker.controller;
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (updateRequested) location.reload();
    else if (!hadController) {
      usePwa.setState((s) => ({ cacheTick: s.cacheTick + 1 }));
      toast.success('Dhurta Suite now works offline', 'The app is saved on this device. Tools you open are saved too, or save them all in Settings.');
    }
  });

  const register = async () => {
    try {
      const reg = await navigator.serviceWorker.register(`${BASE}sw.js`, { scope: BASE });
      const track = (w: ServiceWorker | null) =>
        w?.addEventListener('statechange', () => {
          if (w.state === 'installed' && navigator.serviceWorker.controller) announceUpdate(w);
        });
      if (reg.waiting && navigator.serviceWorker.controller) announceUpdate(reg.waiting);
      track(reg.installing);
      reg.addEventListener('updatefound', () => track(reg.installing));
      await navigator.serviceWorker.ready;
      usePwa.setState({ sw: 'active' });
      void refreshSavedTools();
      // Long-open tabs and installed apps check for a new version every hour.
      setInterval(() => void reg.update().catch(() => undefined), 60 * 60 * 1000);
    } catch {
      usePwa.setState({ sw: 'error' });
    }
  };
  if (document.readyState === 'complete') void register();
  else addEventListener('load', () => void register(), { once: true });
}

/* ---------- Offline status and saving tools ---------- */

let manifestPromise: Promise<OfflineManifest | null> | null = null;
export function offlineManifest(): Promise<OfflineManifest | null> {
  if (!offlineSupported() || !import.meta.env.PROD) return Promise.resolve(null);
  manifestPromise ??= fetch(`${BASE}offline.json`)
    .then((r) => (r.ok ? r.json() : null))
    .catch(() => {
      manifestPromise = null; // retry next time
      return null;
    });
  return manifestPromise;
}

/** Paths of every file currently held in this app's caches. */
export async function cachedPaths(): Promise<Set<string>> {
  const out = new Set<string>();
  for (const name of await caches.keys()) {
    if (!name.startsWith('ds-')) continue;
    for (const req of await (await caches.open(name)).keys()) out.add(new URL(req.url).pathname);
  }
  return out;
}

export interface ToolOfflineInfo {
  state: 'ready' | 'missing' | 'unavailable';
  bytes: number;
}

export async function toolOfflineInfo(toolId: string): Promise<ToolOfflineInfo> {
  const m = await offlineManifest();
  if (!m || !(toolId in m.tools)) return { state: 'unavailable', bytes: 0 };
  const cached = await cachedPaths();
  return isToolReady(m, toolId, cached, BASE) ? { state: 'ready', bytes: m.tools[toolId].bytes } : { state: 'missing', bytes: m.tools[toolId].bytes };
}

export async function offlineSummary(): Promise<{ ready: number; total: number; totalBytes: number } | null> {
  const m = await offlineManifest();
  if (!m) return null;
  const cached = await cachedPaths();
  const ids = Object.keys(m.tools);
  return { ready: ids.filter((id) => isToolReady(m, id, cached, BASE)).length, total: ids.length, totalBytes: m.totalBytes };
}

/** Download the files these tools need into the cache. Reports progress 0–1. */
export async function saveForOffline(toolIds: string[], onProgress?: (p: number) => void): Promise<void> {
  const m = await offlineManifest();
  if (!m) throw new Error('Offline saving is not available in this browser.');
  const cached = await cachedPaths();
  const todo = filesFor(m, toolIds).filter((f) => f !== '' && !cached.has(BASE + f));
  const shell = await caches.open(`ds-shell-${m.version}`);
  const assets = await caches.open(ASSET_CACHE);
  let done = 0;
  const queue = [...todo];
  const worker = async () => {
    for (let f = queue.shift(); f !== undefined; f = queue.shift()) {
      const url = BASE + f;
      const res = await fetch(url, { cache: 'reload' });
      if (!res.ok) throw new Error(`Could not download ${f} (${res.status}).`);
      await (f.startsWith('assets/') ? assets : shell).put(url, res);
      onProgress?.(++done / todo.length);
    }
  };
  await Promise.all(Array.from({ length: 4 }, worker));
  // Remember a "save all" choice so future updates are downloaded too.
  if (toolIds.length === Object.keys(m.tools).length) await (await caches.open(META_CACHE)).put(SAVE_ALL_KEY, new Response('1'));
  onProgress?.(1);
  usePwa.setState((s) => ({ cacheTick: s.cacheTick + 1 }));
}

/**
 * Each release renames the tool files, so an update makes saved tools stale.
 * If the user chose "save all", fetch the new versions quietly in the background.
 */
async function refreshSavedTools() {
  try {
    if (!navigator.onLine || !(await caches.match(SAVE_ALL_KEY))) return;
    const m = await offlineManifest();
    if (m) await saveForOffline(Object.keys(m.tools));
  } catch {
    /* retried on the next start */
  }
}

/** Remove downloaded tools and cached pages (the app shell stays so the app still opens). */
export async function removeOfflineTools(): Promise<void> {
  if (!('caches' in window)) return;
  await Promise.all(['ds-assets', 'ds-pages', SHARE_CACHE, META_CACHE].map((n) => caches.delete(n)));
  usePwa.setState((s) => ({ cacheTick: s.cacheTick + 1 }));
}
