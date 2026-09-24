import { create } from 'zustand';
import { kvGet, kvSet, kvClear } from './kv';

export type ThemePref = 'light' | 'dark' | 'system';
export type Accent = 'blue' | 'teal' | 'violet' | 'orange';

export interface Settings {
  theme: ThemePref;
  accent: Accent;
  reducedMotion: 'system' | 'on' | 'off';
  defaultImageFormat: 'image/jpeg' | 'image/png' | 'image/webp';
  defaultQuality: number;
  useWorkers: boolean;
  useSaveDialog: boolean;
  filenameSuffix: boolean;
  historyEnabled: boolean;
  /** Load the external Photopea editor without asking first. */
  photopeaAutoLoad: boolean;
}

export interface HistoryEntry {
  id: string;
  toolId: string;
  /** Short description of what happened, e.g. "3 files → WebP". Never file contents. */
  summary: string;
  at: number;
}

interface State {
  hydrated: boolean;
  settings: Settings;
  favorites: string[];
  recent: string[];
  history: HistoryEntry[];
  notify: string[];
  hydrate: () => Promise<void>;
  updateSettings: (patch: Partial<Settings>) => void;
  toggleFavorite: (id: string) => void;
  touchRecent: (id: string) => void;
  addHistory: (toolId: string, summary: string) => void;
  clearHistory: () => void;
  clearRecent: () => void;
  toggleNotify: (id: string) => void;
  resetAll: () => Promise<void>;
}

export const DEFAULT_SETTINGS: Settings = {
  theme: 'system',
  accent: 'blue',
  reducedMotion: 'system',
  defaultImageFormat: 'image/webp',
  defaultQuality: 0.82,
  useWorkers: true,
  useSaveDialog: false,
  filenameSuffix: true,
  historyEnabled: true,
  photopeaAutoLoad: false,
};

const persist = (key: string, value: unknown) => void kvSet(key, value);

export const useStore = create<State>((set, get) => ({
  hydrated: false,
  settings: DEFAULT_SETTINGS,
  favorites: [],
  recent: [],
  history: [],
  notify: [],

  async hydrate() {
    const [settings, favorites, recent, history, notify] = await Promise.all([
      kvGet<Partial<Settings>>('settings'),
      kvGet<string[]>('favorites'),
      kvGet<string[]>('recent'),
      kvGet<HistoryEntry[]>('history'),
      kvGet<string[]>('notify'),
    ]);
    set({
      hydrated: true,
      settings: { ...DEFAULT_SETTINGS, ...settings },
      favorites: favorites ?? [],
      recent: recent ?? [],
      history: history ?? [],
      notify: notify ?? [],
    });
  },

  updateSettings(patch) {
    const settings = { ...get().settings, ...patch };
    set({ settings });
    persist('settings', settings);
    if (patch.theme) {
      try {
        localStorage.setItem('ds-theme', JSON.stringify(patch.theme));
      } catch {
        /* storage blocked — theme still applies for this session */
      }
    }
    if (patch.historyEnabled === false) get().clearHistory();
  },

  toggleFavorite(id) {
    const favs = get().favorites;
    const favorites = favs.includes(id) ? favs.filter((f) => f !== id) : [id, ...favs];
    set({ favorites });
    persist('favorites', favorites);
  },

  touchRecent(id) {
    if (!get().settings.historyEnabled) return;
    const recent = [id, ...get().recent.filter((r) => r !== id)].slice(0, 12);
    set({ recent });
    persist('recent', recent);
  },

  addHistory(toolId, summary) {
    if (!get().settings.historyEnabled) return;
    const entry: HistoryEntry = { id: crypto.randomUUID?.() ?? String(Date.now() + Math.random()), toolId, summary, at: Date.now() };
    const history = [entry, ...get().history].slice(0, 200);
    set({ history });
    persist('history', history);
  },

  clearHistory() {
    set({ history: [], recent: [] });
    persist('history', []);
    persist('recent', []);
  },

  clearRecent() {
    set({ recent: [] });
    persist('recent', []);
  },

  toggleNotify(id) {
    const n = get().notify;
    const notify = n.includes(id) ? n.filter((x) => x !== id) : [...n, id];
    set({ notify });
    persist('notify', notify);
  },

  async resetAll() {
    await kvClear();
    try {
      localStorage.removeItem('ds-theme');
    } catch {
      /* ignore */
    }
    set({ settings: DEFAULT_SETTINGS, favorites: [], recent: [], history: [], notify: [] });
  },
}));
