import { useEffect, useState } from 'react';
import { NavLink, Outlet, Link, useLocation } from 'react-router-dom';
import { clsx } from 'clsx';
import { Home, LayoutGrid, Briefcase, History, Settings, Search, Moon, Sun, Monitor, Activity, Shield, Info } from 'lucide-react';
import { APP } from '@/app/config';
import { CATEGORIES, TOOLS, isUsable } from '@/tools/registry';
import { useStore, type ThemePref } from '@/storage/store';
import { triggerOpenFile } from '@/app/shortcuts';
import { Icon } from '@/components/ui/Icon';
import { Drawer } from '@/components/ui/Dialog';
import { t } from '@/i18n';
import { CommandPalette, usePalette } from './CommandPalette';

const counts = Object.fromEntries(CATEGORIES.map((c) => [c.id, TOOLS.filter((x) => x.category === c.id && isUsable(x)).length]));

function Logo() {
  return (
    <Link to="/" className="flex items-center gap-2 rounded-md font-semibold tracking-tight text-fg" aria-label={`${APP.name} home`}>
      <svg viewBox="0 0 32 32" className="h-7 w-7 shrink-0" aria-hidden>
        <rect width="32" height="32" rx="7" fill="rgb(var(--accent))" />
        <path d="M9 8h7.5a8 8 0 0 1 0 16H9z" fill="none" stroke="rgb(var(--accent-fg))" strokeWidth="3" />
        <path d="M13 13h3.5a3 3 0 0 1 0 6H13z" fill="rgb(var(--accent-fg))" />
      </svg>
      <span className="text-[15px]">{APP.name}</span>
    </Link>
  );
}

const navItem = ({ isActive }: { isActive: boolean }) =>
  clsx(
    'flex items-center gap-2.5 rounded-md px-2.5 py-1.5 text-[13.5px] transition-colors',
    isActive ? 'bg-accent/10 font-medium text-accent' : 'text-muted hover:bg-surface2 hover:text-fg',
  );

function SidebarNav({ onNavigate }: { onNavigate?: () => void }) {
  return (
    <nav aria-label="Main" className="flex flex-col gap-5 p-3 text-sm">
      <div className="flex flex-col gap-0.5">
        <NavLink to="/" end className={navItem} onClick={onNavigate}>
          <Home size={16} aria-hidden /> {t('nav.home')}
        </NavLink>
        <NavLink to="/tools" className={navItem} onClick={onNavigate}>
          <LayoutGrid size={16} aria-hidden /> All tools
        </NavLink>
      </div>
      <div>
        <p className="px-2.5 pb-1.5 text-[11px] font-semibold uppercase tracking-wide text-muted">{t('nav.categories')}</p>
        <div className="flex flex-col gap-0.5">
          {CATEGORIES.map((c) => (
            <NavLink key={c.id} to={`/category/${c.id}`} className={navItem} onClick={onNavigate}>
              <Icon name={c.icon} size={16} />
              <span className="flex-1">{c.name}</span>
              <span className="text-[11px] tabular-nums text-muted">{counts[c.id] || ''}</span>
            </NavLink>
          ))}
        </div>
      </div>
      <div className="flex flex-col gap-0.5">
        <NavLink to="/workspace" className={navItem} onClick={onNavigate}>
          <Briefcase size={16} aria-hidden /> {t('nav.workspace')}
        </NavLink>
        <NavLink to="/history" className={navItem} onClick={onNavigate}>
          <History size={16} aria-hidden /> {t('nav.history')}
        </NavLink>
        <NavLink to="/settings" className={navItem} onClick={onNavigate}>
          <Settings size={16} aria-hidden /> {t('nav.settings')}
        </NavLink>
        <NavLink to="/diagnostics" className={navItem} onClick={onNavigate}>
          <Activity size={16} aria-hidden /> {t('nav.diagnostics')}
        </NavLink>
        <NavLink to="/privacy" className={navItem} onClick={onNavigate}>
          <Shield size={16} aria-hidden /> {t('nav.privacy')}
        </NavLink>
        <NavLink to="/about" className={navItem} onClick={onNavigate}>
          <Info size={16} aria-hidden /> {t('nav.about')}
        </NavLink>
      </div>
    </nav>
  );
}

function ThemeButton() {
  const theme = useStore((s) => s.settings.theme);
  const update = useStore((s) => s.updateSettings);
  const order: ThemePref[] = ['system', 'light', 'dark'];
  const next = order[(order.indexOf(theme) + 1) % order.length];
  const I = theme === 'dark' ? Moon : theme === 'light' ? Sun : Monitor;
  const label = `${t('theme.toggle')} (${t(`theme.${theme}`)} → ${t(`theme.${next}`)})`;
  return (
    <button onClick={() => update({ theme: next })} className="flex h-10 w-10 items-center justify-center rounded-md text-muted hover:bg-surface2 hover:text-fg" aria-label={label} title={label}>
      <I size={18} />
    </button>
  );
}

const MOBILE_NAV = [
  { to: '/', label: 'nav.home', icon: Home, end: true },
  { to: '/tools', label: 'nav.tools', icon: LayoutGrid },
  { to: '/workspace', label: 'nav.workspace', icon: Briefcase },
  { to: '/history', label: 'nav.history', icon: History },
  { to: '/settings', label: 'nav.settings', icon: Settings },
] as const;

export function AppShell() {
  const setPalette = usePalette((s) => s.setOpen);
  const [drawer, setDrawer] = useState(false);
  const location = useLocation();

  // Global shortcuts. Only Ctrl+K and "/" are always captured.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const mod = e.ctrlKey || e.metaKey;
      const target = e.target as HTMLElement;
      const typing = target.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(target.tagName);
      if (mod && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setPalette(!usePalette.getState().open);
      } else if (e.key === '/' && !typing && !mod) {
        e.preventDefault();
        setPalette(true);
      } else if (mod && e.key.toLowerCase() === 'o' && !e.shiftKey) {
        if (triggerOpenFile()) e.preventDefault();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [setPalette]);

  // Move focus to main content on navigation for screen-reader users.
  useEffect(() => {
    document.getElementById('main')?.focus({ preventScroll: true });
    window.scrollTo(0, 0);
  }, [location.pathname]);

  return (
    <div className="min-h-screen md:grid md:grid-cols-[232px_1fr] lg:grid-cols-[248px_1fr]">
      <a href="#main" className="sr-only focus:not-sr-only focus:fixed focus:left-3 focus:top-3 focus:z-[70] focus:rounded focus:bg-surface focus:px-3 focus:py-2">
        Skip to content
      </a>

      <aside className="sticky top-0 hidden h-screen overflow-y-auto border-r border-line bg-surface md:block">
        <div className="flex h-14 items-center border-b border-line px-4">
          <Logo />
        </div>
        <SidebarNav />
      </aside>

      <div className="flex min-w-0 flex-col">
        <header className="sticky top-0 z-30 flex h-14 items-center gap-2 border-b border-line bg-surface/90 px-3 backdrop-blur sm:px-4">
          <div className="md:hidden">
            <Logo />
          </div>
          <button
            onClick={() => setPalette(true)}
            className="ml-auto flex h-10 items-center gap-2 rounded-md border border-line bg-bg px-3 text-sm text-muted hover:border-accent/50 md:ml-0 md:w-full md:max-w-md"
            aria-label={t('search.open')}
          >
            <Search size={16} aria-hidden />
            <span className="hidden flex-1 text-left sm:inline">{t('search.placeholder')}</span>
            <kbd className="kbd hidden md:inline-flex">Ctrl K</kbd>
          </button>
          <div className="flex items-center md:ml-auto">
            <ThemeButton />
            <Link to="/settings" className="hidden h-10 w-10 items-center justify-center rounded-md text-muted hover:bg-surface2 hover:text-fg sm:flex" aria-label={t('nav.settings')} title={t('nav.settings')}>
              <Settings size={18} />
            </Link>
          </div>
        </header>

        <main id="main" tabIndex={-1} className="flex-1 px-4 pb-28 pt-5 focus:outline-none sm:px-6 md:pb-10 lg:px-8">
          <div className="mx-auto w-full max-w-6xl">
            <Outlet />
          </div>
        </main>

        <footer className="hidden border-t border-line px-6 py-4 text-xs text-muted md:block">
          <div className="mx-auto flex max-w-6xl flex-wrap gap-x-4 gap-y-1">
            <span>
              {APP.name} v{APP.version} · by {APP.org}
            </span>
            <Link to="/privacy" className="hover:text-fg">
              {t('nav.privacy')}
            </Link>
            <Link to="/about" className="hover:text-fg">
              {t('nav.about')}
            </Link>
            <Link to="/diagnostics" className="hover:text-fg">
              {t('nav.diagnostics')}
            </Link>
          </div>
        </footer>
      </div>

      {/* Mobile bottom navigation */}
      <nav aria-label="Primary" className="pb-safe fixed inset-x-0 bottom-0 z-40 border-t border-line bg-surface md:hidden">
        <ul className="grid grid-cols-5">
          {MOBILE_NAV.map(({ to, label, icon: I, ...rest }) => (
            <li key={to}>
              <NavLink
                to={to}
                end={'end' in rest}
                onClick={(e) => {
                  if (to === '/tools' && location.pathname.startsWith('/tools')) {
                    e.preventDefault();
                    setDrawer(true);
                  }
                }}
                className={({ isActive }) => clsx('flex h-16 flex-col items-center justify-center gap-1 text-[11px]', isActive ? 'text-accent' : 'text-muted')}
              >
                <I size={20} aria-hidden />
                {t(label)}
              </NavLink>
            </li>
          ))}
        </ul>
      </nav>

      <Drawer open={drawer} onClose={() => setDrawer(false)} title={t('nav.menu')}>
        <SidebarNav onNavigate={() => setDrawer(false)} />
      </Drawer>

      <CommandPalette />
    </div>
  );
}
