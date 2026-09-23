import { create } from 'zustand';

/**
 * In-memory hand-off of files from the universal drop zone to a tool page.
 * Never persisted: files live only in this tab's memory.
 */
interface HandoffState {
  files: File[] | null;
  give: (files: File[]) => void;
  clear: () => void;
}

export const useHandoff = create<HandoffState>((set) => ({
  files: null,
  give: (files) => set({ files }),
  clear: () => set({ files: null }),
}));
