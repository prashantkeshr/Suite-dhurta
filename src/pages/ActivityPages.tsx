import { Link } from 'react-router-dom';
import { History as HistoryIcon, Star, Bell } from 'lucide-react';
import { getTool } from '@/tools/registry';
import { useStore } from '@/storage/store';
import { useDocumentMeta } from '@/hooks/useDocumentMeta';
import { t } from '@/i18n';
import { Button, Card } from '@/components/ui/primitives';
import { EmptyState } from '@/components/ui/states';
import { Icon } from '@/components/ui/Icon';
import { Breadcrumb } from '@/components/tools/common';
import { ToolGrid } from '@/components/tools/ToolCard';
import type { ToolDefinition } from '@/types/tool';

const defined = (x: ToolDefinition | undefined): x is ToolDefinition => !!x;

function when(ts: number) {
  const d = new Date(ts);
  const today = new Date();
  const sameDay = d.toDateString() === today.toDateString();
  return sameDay ? d.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' }) : d.toLocaleDateString(undefined, { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
}

export function HistoryPage() {
  useDocumentMeta('History', 'Your recent activity, stored only in this browser.', '/history');
  const { history, settings, clearHistory } = useStore();
  return (
    <div className="max-w-3xl">
      <Breadcrumb items={[{ label: t('nav.home'), to: '/' }, { label: t('nav.history') }]} />
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h1 className="text-2xl font-semibold tracking-tight">{t('history.title')}</h1>
        {history.length > 0 && <Button onClick={clearHistory}>{t('history.clear')}</Button>}
      </div>
      <p className="mt-1 text-muted">Only tool names and short summaries are stored, in this browser. File contents are never saved.</p>
      <div className="mt-6">
        {!settings.historyEnabled ? (
          <EmptyState icon={<HistoryIcon size={28} strokeWidth={1.5} />} title={t('history.disabled')} action={<Link to="/settings#privacy" className="link">{t('nav.settings')}</Link>} />
        ) : history.length === 0 ? (
          <EmptyState icon={<HistoryIcon size={28} strokeWidth={1.5} />} title={t('history.empty')} body="Use a tool and it will appear here." />
        ) : (
          <Card>
            <ul className="divide-y divide-line">
              {history.map((h) => {
                const tool = getTool(h.toolId);
                return (
                  <li key={h.id} className="flex items-center gap-3 px-4 py-3">
                    <Icon name={tool?.icon ?? 'Wrench'} size={17} className="shrink-0 text-muted" />
                    <div className="min-w-0 flex-1">
                      <Link to={`/tools/${h.toolId}`} className="font-medium text-fg hover:underline">
                        {tool?.name ?? h.toolId}
                      </Link>
                      <p className="truncate text-sm text-muted">{h.summary}</p>
                    </div>
                    <time className="shrink-0 text-xs text-muted" dateTime={new Date(h.at).toISOString()}>
                      {when(h.at)}
                    </time>
                  </li>
                );
              })}
            </ul>
          </Card>
        )}
      </div>
    </div>
  );
}

export function WorkspacePage() {
  useDocumentMeta('Workspace', 'Your favorite and recent tools, kept locally in this browser.', '/workspace');
  const { favorites, recent, notify, clearRecent } = useStore();
  const fav = favorites.map(getTool).filter(defined);
  const rec = recent.map(getTool).filter(defined);
  const watching = notify.map(getTool).filter(defined);
  return (
    <div>
      <Breadcrumb items={[{ label: t('nav.home'), to: '/' }, { label: t('nav.workspace') }]} />
      <h1 className="text-2xl font-semibold tracking-tight">My workspace</h1>
      <p className="mt-1 text-muted">Everything here lives in this browser. Nothing is synced to the cloud.</p>

      <section className="mt-6" aria-labelledby="ws-fav">
        <h2 id="ws-fav" className="section-title flex items-center gap-2">
          <Star size={15} aria-hidden /> {t('home.favorites')}
        </h2>
        {fav.length ? <ToolGrid tools={fav} dense /> : <EmptyState title="No favorites yet" body="Use the star on any tool to pin it here and on the home page." />}
      </section>

      <section className="mt-8" aria-labelledby="ws-recent">
        <div className="flex items-baseline justify-between">
          <h2 id="ws-recent" className="section-title flex items-center gap-2">
            <HistoryIcon size={15} aria-hidden /> Recent tools
          </h2>
          {rec.length > 0 && (
            <button onClick={clearRecent} className="text-xs text-muted hover:text-fg">
              {t('action.clear')}
            </button>
          )}
        </div>
        {rec.length ? <ToolGrid tools={rec} dense /> : <EmptyState title="No recent tools" />}
      </section>

      {watching.length > 0 && (
        <section className="mt-8" aria-labelledby="ws-watch">
          <h2 id="ws-watch" className="section-title flex items-center gap-2">
            <Bell size={15} aria-hidden /> Reminders for upcoming tools
          </h2>
          <ToolGrid tools={watching} dense />
        </section>
      )}

      <p className="mt-8 text-xs text-muted">A local file workspace (keeping files between visits, with your consent) is planned. Today, files stay in memory only while a tool page is open.</p>
    </div>
  );
}
