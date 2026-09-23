import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { useNavigate } from 'react-router-dom';
import { create } from 'zustand';
import { clsx } from 'clsx';
import { Search, Settings, History, Moon, Sun, Activity, Home, LayoutGrid, Shield, Keyboard, Briefcase } from 'lucide-react';
import { searchTools } from '@/search/search';
import { TOOLS, popularTools, getTool, isUsable } from '@/tools/registry';
import { useStore } from '@/storage/store';
import { Icon } from '@/components/ui/Icon';
import { StatusBadge } from '@/components/ui/primitives';
import { t } from '@/i18n';

export const usePalette = create<{ open: boolean; setOpen: (v: boolean) => void }>((set) => ({
  open: false,
  setOpen: (open) => set({ open }),
}));

interface Item {
  id: string;
  group: 'tools' | 'commands';
  label: string;
  hint?: ReactNode;
  icon: ReactNode;
  run: () => void;
}

export function CommandPalette() {
  const { open, setOpen } = usePalette();
  const [query, setQuery] = useState('');
  const [active, setActive] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLUListElement>(null);
  const navigate = useNavigate();
  const recent = useStore((s) => s.recent);
  const theme = useStore((s) => s.settings.theme);
  const updateSettings = useStore((s) => s.updateSettings);

  useEffect(() => {
    if (open) {
      setQuery('');
      setActive(0);
      const previous = document.activeElement as HTMLElement | null;
      requestAnimationFrame(() => inputRef.current?.focus());
      return () => previous?.focus?.();
    }
  }, [open]);

  const items = useMemo<Item[]>(() => {
    const go = (path: string) => () => {
      navigate(path);
      setOpen(false);
    };
    const isDark = document.documentElement.dataset.theme === 'dark';
    const commands: Item[] = [
      { id: 'c-home', group: 'commands', label: 'Go to Home', icon: <Home size={16} />, run: go('/') },
      { id: 'c-tools', group: 'commands', label: 'Browse all tools', icon: <LayoutGrid size={16} />, run: go('/tools') },
      { id: 'c-workspace', group: 'commands', label: 'Open Workspace', icon: <Briefcase size={16} />, run: go('/workspace') },
      { id: 'c-history', group: 'commands', label: 'Open History', icon: <History size={16} />, run: go('/history') },
      { id: 'c-settings', group: 'commands', label: 'Open Settings', icon: <Settings size={16} />, run: go('/settings') },
      { id: 'c-diag', group: 'commands', label: 'Browser diagnostics', icon: <Activity size={16} />, run: go('/diagnostics') },
      { id: 'c-privacy', group: 'commands', label: 'Privacy', icon: <Shield size={16} />, run: go('/privacy') },
      { id: 'c-keys', group: 'commands', label: 'Keyboard shortcuts', icon: <Keyboard size={16} />, run: go('/settings#shortcuts') },
      {
        id: 'c-theme',
        group: 'commands',
        label: isDark ? 'Switch to light mode' : 'Switch to dark mode',
        hint: theme === 'system' ? 'currently following system' : undefined,
        icon: isDark ? <Sun size={16} /> : <Moon size={16} />,
        run: () => {
          updateSettings({ theme: isDark ? 'light' : 'dark' });
          setOpen(false);
        },
      },
    ];
    const toolItem = (id: string): Item | null => {
      const tool = getTool(id);
      if (!tool) return null;
      return {
        id: `t-${tool.id}`,
        group: 'tools',
        label: tool.name,
        hint: !isUsable(tool) ? <StatusBadge status={tool.status} /> : undefined,
        icon: <Icon name={tool.icon} size={16} />,
        run: go(`/tools/${tool.id}`),
      };
    };
    const q = query.trim();
    if (!q) {
      const ids = [...new Set([...recent, ...popularTools().map((p) => p.id)])].slice(0, 8);
      return [...ids.map(toolItem).filter((x): x is Item => !!x), ...commands];
    }
    const toolResults = searchTools(q, 12).map((r) => toolItem(r.tool.id)!);
    const ql = q.toLowerCase();
    const cmdResults = commands.filter((c) => c.label.toLowerCase().includes(ql));
    return [...toolResults, ...cmdResults];
  }, [query, recent, navigate, setOpen, theme, updateSettings]);

  useEffect(() => setActive(0), [query]);
  useEffect(() => {
    listRef.current?.querySelector(`[data-index="${active}"]`)?.scrollIntoView({ block: 'nearest' });
  }, [active]);

  if (!open) return null;

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setActive((a) => Math.min(items.length - 1, a + 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setActive((a) => Math.max(0, a - 1));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      items[active]?.run();
    } else if (e.key === 'Escape') {
      e.preventDefault();
      setOpen(false);
    } else if (e.key === 'Tab') {
      e.preventDefault();
    }
  };

  let lastGroup = '';
  return createPortal(
    <div className="fixed inset-0 z-50 flex items-start justify-center px-3 pt-[8vh] sm:pt-[14vh]">
      <div className="absolute inset-0 bg-black/40" onClick={() => setOpen(false)} aria-hidden />
      <div role="dialog" aria-modal="true" aria-label={t('search.open')} className="animate-in relative w-full max-w-xl overflow-hidden rounded-xl border border-line bg-surface" style={{ boxShadow: 'var(--shadow-lg)' }} onKeyDown={onKeyDown}>
        <div className="flex items-center gap-3 border-b border-line px-4">
          <Search size={18} className="shrink-0 text-muted" aria-hidden />
          <input
            ref={inputRef}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={t('search.placeholder')}
            className="h-14 w-full bg-transparent text-[15px] text-fg placeholder:text-muted focus:outline-none"
            role="combobox"
            aria-expanded="true"
            aria-controls="palette-list"
            aria-activedescendant={items[active] ? `pal-${items[active].id}` : undefined}
            aria-autocomplete="list"
          />
          <kbd className="kbd hidden sm:inline-flex">Esc</kbd>
        </div>
        <ul ref={listRef} id="palette-list" role="listbox" className="max-h-[60vh] overflow-y-auto p-2">
          {items.length === 0 && (
            <li className="px-3 py-8 text-center text-sm text-muted">
              <p>{t('search.empty', { q: query })}</p>
              <p className="mt-1 text-xs">{t('search.hint')}</p>
            </li>
          )}
          {items.map((item, i) => {
            const header = item.group !== lastGroup ? (lastGroup = item.group) : null;
            return (
              <li key={item.id} role="presentation">
                {header && <p className="px-3 pb-1 pt-2 text-[11px] font-semibold uppercase tracking-wide text-muted">{header === 'tools' ? (query ? t('search.tools') : t('home.recent') + ' & ' + t('home.popular').toLowerCase()) : t('search.commands')}</p>}
                <div
                  id={`pal-${item.id}`}
                  role="option"
                  aria-selected={i === active}
                  data-index={i}
                  onMouseMove={() => setActive(i)}
                  onClick={item.run}
                  className={clsx('flex cursor-pointer items-center gap-3 rounded-md px-3 py-2.5 text-sm', i === active ? 'bg-accent/10 text-fg' : 'text-fg')}
                >
                  <span className={clsx(i === active ? 'text-accent' : 'text-muted')}>{item.icon}</span>
                  <span className="flex-1 truncate">{item.label}</span>
                  {item.hint && <span className="text-xs text-muted">{item.hint}</span>}
                </div>
              </li>
            );
          })}
        </ul>
        <div className="hidden items-center gap-4 border-t border-line px-4 py-2 text-[11px] text-muted sm:flex">
          <span><kbd className="kbd">↑</kbd> <kbd className="kbd">↓</kbd> navigate</span>
          <span><kbd className="kbd">Enter</kbd> open</span>
          <span className="ml-auto">{TOOLS.filter(isUsable).length} tools available</span>
        </div>
      </div>
    </div>,
    document.body,
  );
}
