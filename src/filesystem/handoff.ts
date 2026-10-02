import { create } from 'zustand';

/**
 * In-memory hand-off of files from the universal drop zone to a tool page.
 * Never persisted: files live only in this tab's memory.
 */
interface HandoffState {
  files: File[] | null;
  give: (files: File[]) => void;
  clear: () => void;
  /** Files opened with the installed app or shared to it; the home page picks them up. */
  incoming: File[] | null;
  receive: (files: File[]) => void;
  takeIncoming: () => File[] | null;
}

export const useHandoff = create<HandoffState>((set, get) => ({
  files: null,
  give: (files) => set({ files }),
  clear: () => set({ files: null }),
  incoming: null,
  receive: (files) => set({ incoming: files }),
  takeIncoming: () => {
    const f = get().incoming;
    set({ incoming: null });
    return f;
  },
}));
