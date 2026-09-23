import { useState } from 'react';
import { Link } from 'react-router-dom';
import { clsx } from 'clsx';
import { Repeat, Minimize2, PenLine, PlusSquare, BarChart3, ShieldCheck, ArrowRight } from 'lucide-react';
import type { Intent } from '@/types/tool';
import { APP } from '@/app/config';
import { CATEGORIES, TOOLS, getTool, popularTools, toolsForIntent, isUsable } from '@/tools/registry';
import { useStore } from '@/storage/store';
import { useDocumentMeta } from '@/hooks/useDocumentMeta';
import { t } from '@/i18n';
import { Icon } from '@/components/ui/Icon';
import { FileDropzone } from '@/components/files/FileDropzone';
import { FileActions } from '@/components/files/FileActions';
import { ToolGrid } from '@/components/tools/ToolCard';

const INTENTS: { id: Intent; icon: typeof Repeat }[] = [
  { id: 'convert', icon: Repeat },
  { id: 'compress', icon: Minimize2 },
  { id: 'edit', icon: PenLine },
  { id: 'create', icon: PlusSquare },
  { id: 'analyze', icon: BarChart3 },
];

export default function HomePage() {
  useDocumentMeta('', 'Image, PDF, text, data and developer tools that run entirely in your browser. No upload, no account, no server processing.', '/');
  const [files, setFiles] = useState<File[] | null>(null);
  const [intent, setIntent] = useState<Intent | null>(null);
  const recent = useStore((s) => s.recent);
  const favorites = useStore((s) => s.favorites);
  const notify = useStore((s) => s.notify);

  const recentTools = recent.map(getTool).filter((x) => !!x && isUsable(x)).slice(0, 6) as NonNullable<ReturnType<typeof getTool>>[];
  const favoriteTools = favorites.map(getTool).filter(Boolean) as NonNullable<ReturnType<typeof getTool>>[];
  const shippedWatched = notify.map(getTool).filter((x) => !!x && isUsable(x)) as NonNullable<ReturnType<typeof getTool>>[];
  const available = TOOLS.filter(isUsable).length;

  return (
    <div className="space-y-10">
      <section aria-labelledby="home-title" className="pt-2 sm:pt-6">
        <h1 id="home-title" className="text-2xl font-semibold tracking-tight sm:text-3xl">
          {t('home.title')}
        </h1>
        <p className="mt-1.5 flex items-center gap-1.5 text-[15px] text-muted">
          <ShieldCheck size={16} className="shrink-0 text-success" aria-hidden />
          {t('home.subtitle')}
        </p>

        <div role="group" aria-label="Choose a task" className="no-scrollbar mt-5 flex gap-2 overflow-x-auto pb-1 sm:flex-wrap">
          {INTENTS.map(({ id, icon: I }) => (
            <button
              key={id}
              onClick={() => setIntent(intent === id ? null : id)}
              aria-pressed={intent === id}
              className={clsx(
                'flex h-11 shrink-0 items-center gap-2 rounded-lg border px-4 text-sm font-medium transition-colors',
                intent === id ? 'border-accent bg-accent/10 text-accent' : 'border-line bg-surface text-fg hover:border-accent/50',
              )}
            >
              <I size={17} aria-hidden /> {t(`home.intent.${id}`)}
            </button>
          ))}
        </div>

        {intent && (
          <div className="animate-in mt-4">
            <ToolGrid tools={toolsForIntent(intent)} dense />
          </div>
        )}
      </section>

      <section aria-label="Universal file drop zone">
        {files ? <FileActions files={files} onClear={() => setFiles(null)} /> : <FileDropzone onFiles={setFiles} acceptLabel="images, PDFs, text, CSV, JSON, ZIP and more" />}
      </section>

      {shippedWatched.length > 0 && (
        <section aria-labelledby="new-title">
          <h2 id="new-title" className="section-title">
            Now available — tools you asked to be reminded about
          </h2>
          <ToolGrid tools={shippedWatched} dense />
        </section>
      )}

      {favoriteTools.length > 0 && (
        <section aria-labelledby="fav-title">
          <h2 id="fav-title" className="section-title">
            {t('home.favorites')}
          </h2>
          <ToolGrid tools={favoriteTools} dense />
        </section>
      )}

      {recentTools.length > 0 && (
        <section aria-labelledby="recent-title">
          <div className="flex items-baseline justify-between">
            <h2 id="recent-title" className="section-title">
              {t('home.recent')}
            </h2>
            <Link to="/history" className="text-xs text-muted hover:text-fg">
              {t('nav.history')}
            </Link>
          </div>
          <ToolGrid tools={recentTools} dense />
        </section>
      )}

      <section aria-labelledby="popular-title">
        <h2 id="popular-title" className="section-title">
          {t('home.popular')}
        </h2>
        <ToolGrid tools={popularTools()} />
      </section>

      <section aria-labelledby="cat-title">
        <div className="flex items-baseline justify-between">
          <h2 id="cat-title" className="section-title">
            {t('home.browse')}
          </h2>
          <Link to="/tools" className="inline-flex items-center gap-1 text-xs text-muted hover:text-fg">
            {t('home.all')} ({available} available) <ArrowRight size={12} aria-hidden />
          </Link>
        </div>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
          {CATEGORIES.map((c) => {
            const n = TOOLS.filter((x) => x.category === c.id && isUsable(x)).length;
            const soon = TOOLS.filter((x) => x.category === c.id && !isUsable(x)).length;
            return (
              <Link key={c.id} to={`/category/${c.id}`} className="card flex flex-col gap-2 p-4 transition-colors hover:border-accent/50">
                <Icon name={c.icon} size={20} className="text-accent" />
                <span className="font-medium text-fg">{c.name}</span>
                <span className="text-xs text-muted">
                  {n} available{soon ? ` · ${soon} coming soon` : ''}
                </span>
              </Link>
            );
          })}
        </div>
      </section>

      <p className="text-center text-xs text-muted">
        {APP.name} processes files locally in your browser. <Link to="/privacy" className="link">How your privacy is protected</Link>
      </p>
    </div>
  );
}
