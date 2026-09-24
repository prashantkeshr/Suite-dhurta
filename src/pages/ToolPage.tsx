import { lazy, Suspense, useEffect, useMemo, useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { Star, AlertTriangle, Loader2, WifiOff, Wifi } from 'lucide-react';
import { clsx } from 'clsx';
import { getTool, getCategory, relatedTools, formatLabel, isUsable } from '@/tools/registry';
import { TOOL_LOADERS } from '@/tools/loaders';
import { missingCapabilities, capabilityLabel } from '@/capabilities/detect';
import { useHandoff } from '@/filesystem/handoff';
import { useStore } from '@/storage/store';
import { useDocumentMeta } from '@/hooks/useDocumentMeta';
import { formatBytes } from '@/utils/format';
import { t } from '@/i18n';
import { Icon } from '@/components/ui/Icon';
import { StatusBadge, Disclosure } from '@/components/ui/primitives';
import { ComingSoon, ProcessingNotice, EmptyState } from '@/components/ui/states';
import { Breadcrumb } from '@/components/tools/common';
import { ToolGrid } from '@/components/tools/ToolCard';
import { ErrorBoundary } from '@/components/ErrorBoundary';

const lazyCache = new Map<string, ReturnType<typeof lazy>>();
function lazyTool(id: string) {
  if (!lazyCache.has(id)) lazyCache.set(id, lazy(TOOL_LOADERS[id]));
  return lazyCache.get(id)!;
}

function Loading() {
  return (
    <div className="flex items-center gap-2 py-10 text-sm text-muted" role="status">
      <Loader2 size={16} className="animate-spin" aria-hidden /> Loading processing engine…
    </div>
  );
}

/** Remount per tool so per-visit state (like handed-over files) never leaks between tools. */
export default function ToolRoute() {
  const { id = '' } = useParams();
  return <ToolPage key={id} id={id} />;
}

function ToolPage({ id }: { id: string }) {
  const tool = getTool(id);
  const category = tool && getCategory(tool.category);
  const favorite = useStore((s) => s.favorites.includes(id));
  const toggleFavorite = useStore((s) => s.toggleFavorite);
  const touchRecent = useStore((s) => s.touchRecent);
  // Files handed over from the universal drop zone. Read during render without
  // side effects (render may run twice in development), then cleared.
  const [initialFiles] = useState(() => useHandoff.getState().files ?? undefined);
  useEffect(() => {
    useHandoff.getState().clear();
  }, []);

  useDocumentMeta(tool ? tool.name : t('tool.notFound'), tool?.description, tool ? `/tools/${tool.id}` : undefined);

  const usable = !!tool && isUsable(tool) && !!TOOL_LOADERS[tool.id];
  useEffect(() => {
    if (usable) touchRecent(id);
  }, [id, usable, touchRecent]);

  const missing = useMemo(() => (tool ? missingCapabilities(tool.requires) : []), [tool]);

  if (!tool) {
    return (
      <EmptyState
        title={t('tool.notFound')}
        body="This tool does not exist or may have been renamed."
        action={
          <Link to="/tools" className="link">
            {t('home.all')}
          </Link>
        }
      />
    );
  }

  const ToolComponent = usable ? lazyTool(tool.id) : null;
  const related = relatedTools(tool);
  const hasHelp = tool.help || (tool.limitations?.length ?? 0) > 0;

  return (
    <article>
      <Breadcrumb items={[{ label: t('nav.home'), to: '/' }, ...(category ? [{ label: category.name, to: `/category/${category.id}` }] : []), { label: tool.name }]} />

      <header className="mb-5 flex items-start gap-3">
        <div className={clsx('hidden h-11 w-11 shrink-0 items-center justify-center rounded-lg sm:flex', usable ? 'bg-accent/10 text-accent' : 'bg-surface2 text-muted')}>
          <Icon name={tool.icon} size={22} />
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="text-xl font-semibold tracking-tight sm:text-2xl">{tool.name}</h1>
            <StatusBadge status={tool.status} hideAvailable />
          </div>
          <p className="mt-1 text-[15px] text-muted">{tool.description}</p>
          <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted">
            {usable && tool.processing === 'client' && <ProcessingNotice tool={tool} compact />}
            {usable && (
              <span className="inline-flex items-center gap-1">
                {tool.offline === 'no' ? <WifiOff size={13} aria-hidden /> : <Wifi size={13} aria-hidden />}
                {/* Until the offline app shell (PWA) ships, only processing — not reloading — works without internet. */}
                {tool.offline === 'yes' ? 'No internet needed once open' : tool.offline === 'limited' ? 'Partly works offline' : 'Needs internet'}
              </span>
            )}
            {tool.inputTypes.length > 0 && (
              <span>
                {t('tool.formats')}: {formatLabel(tool.inputTypes)}
              </span>
            )}
            {tool.batch && usable && <span>{t('tool.batch')}: multiple files</span>}
          </div>
        </div>
        <button
          onClick={() => toggleFavorite(tool.id)}
          aria-pressed={favorite}
          aria-label={favorite ? t('tool.unfavorite') : t('tool.favorite')}
          title={favorite ? t('tool.unfavorite') : t('tool.favorite')}
          className={clsx('flex h-10 w-10 shrink-0 items-center justify-center rounded-md hover:bg-surface2', favorite ? 'text-warning' : 'text-muted')}
        >
          <Star size={18} fill={favorite ? 'currentColor' : 'none'} />
        </button>
      </header>

      {missing.length > 0 && usable && (
        <div role="alert" className="mb-4 flex items-start gap-3 rounded-lg border border-warning/30 bg-warning/5 p-3 text-sm">
          <AlertTriangle size={18} className="mt-0.5 shrink-0 text-warning" aria-hidden />
          <div>
            <p className="font-semibold uppercase tracking-wide text-warning text-xs">Limited browser support</p>
            <p className="mt-0.5 text-fg">This browser is missing: {missing.map(capabilityLabel).join(', ')}. The tool may not work here. Try a current version of Chrome, Edge, Firefox or Safari.</p>
          </div>
        </div>
      )}

      {ToolComponent ? (
        <ErrorBoundary resetKey={tool.id}>
          <Suspense fallback={<Loading />}>
            <ToolComponent key={tool.id} tool={tool} initialFiles={initialFiles} />
          </Suspense>
        </ErrorBoundary>
      ) : (
        <ComingSoon tool={tool} />
      )}

      {usable && tool.processing === 'client' && (
        <div className="mt-8">
          <ProcessingNotice tool={tool} />
        </div>
      )}
      {tool.processing === 'external' && (
        <div className="mt-8">
          <ProcessingNotice tool={tool} />
        </div>
      )}

      {related.length > 0 && (
        <section className="mt-8" aria-labelledby="related-title">
          <h2 id="related-title" className="section-title">
            {t('tool.related')}
          </h2>
          <ToolGrid tools={related} dense />
        </section>
      )}

      {usable && hasHelp && (
        <section className="mt-8" aria-labelledby="help-title">
          <h2 id="help-title" className="section-title">
            {t('tool.help')}
          </h2>
          <div className="card px-4">
            {tool.inputTypes.length > 0 && <Disclosure title="Supported formats">Input: {formatLabel(tool.inputTypes)}{tool.outputTypes.length > 0 && <><br />Output: {formatLabel(tool.outputTypes)}</>}</Disclosure>}
            {tool.limitations && tool.limitations.length > 0 && (
              <Disclosure title={t('tool.limitations')}>
                <ul className="list-disc space-y-1 pl-5">
                  {tool.limitations.map((l) => (
                    <li key={l}>{l}</li>
                  ))}
                </ul>
              </Disclosure>
            )}
            {tool.help?.problems && (
              <Disclosure title="Common problems">
                <ul className="list-disc space-y-1 pl-5">
                  {tool.help.problems.map((l) => (
                    <li key={l}>{l}</li>
                  ))}
                </ul>
              </Disclosure>
            )}
            {(tool.help?.fileSize || tool.maxRecommendedBytes) && (
              <Disclosure title="File size considerations">
                {tool.help?.fileSize}
                {tool.maxRecommendedBytes && ` Recommended maximum: ${formatBytes(tool.maxRecommendedBytes)}.`}
              </Disclosure>
            )}
            {tool.help?.browsers && <Disclosure title="Browser compatibility">{tool.help.browsers}</Disclosure>}
            <Disclosure title="Privacy">
              {tool.processing === 'client'
                ? 'This tool runs entirely in your browser. Your files are read into this tab’s memory, processed, and offered back to you as a download. They are never sent to a server, and they are discarded when you close or leave the page.'
                : `This tool sends data to ${tool.externalService?.name}. Their privacy policy applies.`}
            </Disclosure>
            {tool.help?.troubleshooting && (
              <Disclosure title="Troubleshooting">
                <ol className="list-decimal space-y-1 pl-5">
                  {tool.help.troubleshooting.map((l) => (
                    <li key={l}>{l}</li>
                  ))}
                </ol>
              </Disclosure>
            )}
          </div>
        </section>
      )}
    </article>
  );
}
