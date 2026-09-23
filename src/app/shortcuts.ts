/**
 * Page-scoped keyboard shortcut targets. Ctrl+O is only intercepted when a
 * page has registered a file-open handler, so the browser shortcut keeps
 * working everywhere else.
 */
const openHandlers: (() => void)[] = [];

export function registerOpenFile(fn: () => void): () => void {
  openHandlers.push(fn);
  return () => {
    const i = openHandlers.lastIndexOf(fn);
    if (i >= 0) openHandlers.splice(i, 1);
  };
}

export function triggerOpenFile(): boolean {
  const fn = openHandlers[openHandlers.length - 1];
  if (!fn) return false;
  fn();
  return true;
}

export const SHORTCUTS: { keys: string; description: string }[] = [
  { keys: 'Ctrl / ⌘ + K', description: 'Search tools and commands' },
  { keys: '/', description: 'Search tools (when not typing)' },
  { keys: 'Ctrl / ⌘ + O', description: 'Open files (on pages with a drop zone)' },
  { keys: 'Esc', description: 'Close dialog or palette' },
  { keys: '↑ ↓  Enter', description: 'Move and choose in the command palette' },
  { keys: '← →', description: 'Switch tabs' },
];
