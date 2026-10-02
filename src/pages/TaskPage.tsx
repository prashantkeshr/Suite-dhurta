import { Suspense, useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { Loader2 } from 'lucide-react';
import { APP } from '@/app/config';
import { getTool, isUsable } from '@/tools/registry';
import { TOOL_LOADERS } from '@/tools/loaders';
import { lazyTool } from '@/tools/lazyTool';
import { getTask, type Task } from '@/seo/tasks';
import { useHandoff } from '@/filesystem/handoff';
import { useStore } from '@/storage/store';
import { useDocumentMeta } from '@/hooks/useDocumentMeta';
import { Breadcrumb } from '@/components/tools/common';
import { ProcessingNotice } from '@/components/ui/states';
import { ErrorBoundary } from '@/components/ErrorBoundary';
import { ToolOfflineStatus } from '@/components/pwa/Offline';
import NotFound from './NotFoundRoute';

const UI = {
  en: { home: 'Home', steps: 'How to do it', faq: 'Frequently asked questions', more: 'Related', full: 'Open the full tool', loading: 'Loading…' },
  hi: { home: 'होम', steps: 'कैसे करें', faq: 'अक्सर पूछे जाने वाले सवाल', more: 'ये भी देखें', full: 'पूरा टूल खोलें', loading: 'लोड हो रहा है…' },
};

function TaskView({ task }: { task: Task }) {
  const tool = getTool(task.toolId)!;
  const ui = UI[task.lang];
  const touchRecent = useStore((s) => s.touchRecent);
  const [initialFiles] = useState(() => useHandoff.getState().files ?? undefined);
  useEffect(() => {
    useHandoff.getState().clear();
    touchRecent(tool.id);
  }, [tool.id, touchRecent]);
  useDocumentMeta(`${task.title} | ${APP.name}`, task.description, `/${task.slug}`);
  // The page content is in Hindi on /hi/ pages; tell browsers and screen readers.
  useEffect(() => {
    document.documentElement.lang = task.lang;
    return () => {
      document.documentElement.lang = 'en';
    };
  }, [task.lang]);

  const Tool = isUsable(tool) && TOOL_LOADERS[tool.id] ? lazyTool(tool.id) : null;
  const related = (task.related ?? []).map(getTask).filter((t): t is Task => !!t);
  const twin = task.twin ? getTask(task.twin) : undefined;

  return (
    <article lang={task.lang}>
      <Breadcrumb items={[{ label: ui.home, to: '/' }, { label: tool.name, to: `/tools/${tool.id}` }, { label: task.h1 }]} />
      <header className="mb-5">
        <h1 className="text-xl font-semibold tracking-tight sm:text-2xl">{task.h1}</h1>
        <p className="mt-2 max-w-3xl text-[15px] text-muted">{task.intro}</p>
        <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted">
          <ProcessingNotice tool={tool} compact />
          <ToolOfflineStatus tool={tool} />
          {twin && (
            <Link to={`/${twin.slug}`} hrefLang={twin.lang} className="font-medium text-accent hover:underline">
              {twin.lang === 'hi' ? 'हिंदी में पढ़ें' : 'Read in English'}
            </Link>
          )}
        </div>
      </header>

      {Tool && (
        <ErrorBoundary resetKey={task.slug}>
          <Suspense
            fallback={
              <div className="flex items-center gap-2 py-10 text-sm text-muted" role="status">
                <Loader2 size={16} className="animate-spin" aria-hidden /> {ui.loading}
              </div>
            }
          >
            <Tool key={task.slug} tool={tool} initialFiles={initialFiles} preset={task.preset} />
          </Suspense>
        </ErrorBoundary>
      )}

      <section className="mt-8" aria-labelledby="task-steps">
        <h2 id="task-steps" className="section-title">
          {ui.steps}
        </h2>
        <ol className="card list-decimal space-y-1.5 py-3 pl-9 pr-4 text-sm text-muted">
          {task.steps.map((s) => (
            <li key={s}>{s}</li>
          ))}
        </ol>
      </section>

      <section className="mt-8" aria-labelledby="task-faq">
        <h2 id="task-faq" className="section-title">
          {ui.faq}
        </h2>
        <div className="card divide-y divide-line px-4">
          {task.faqs.map((f) => (
            <details key={f.q} className="group py-3">
              <summary className="flex cursor-pointer list-none items-center justify-between gap-3 text-sm font-medium text-fg">
                {f.q}
                <span className="text-muted transition-transform group-open:rotate-90" aria-hidden>
                  ›
                </span>
              </summary>
              <p className="mt-2 text-sm text-muted">{f.a}</p>
            </details>
          ))}
        </div>
      </section>

      <section className="mt-8" aria-labelledby="task-more">
        <h2 id="task-more" className="section-title">
          {ui.more}
        </h2>
        <ul className="flex flex-wrap gap-2">
          {related.map((r) => (
            <li key={r.slug}>
              <Link to={`/${r.slug}`} className="inline-flex min-h-[36px] items-center rounded-full border border-line bg-surface px-3 text-sm text-fg hover:border-accent/50 hover:text-accent">
                {r.h1}
              </Link>
            </li>
          ))}
          <li>
            <Link to={`/tools/${tool.id}`} className="inline-flex min-h-[36px] items-center rounded-full border border-accent/40 bg-accent/5 px-3 text-sm font-medium text-accent hover:bg-accent/10">
              {ui.full}: {tool.name}
            </Link>
          </li>
        </ul>
      </section>
    </article>
  );
}

/** /:slug and /hi/:slug — remounts per page so presets and hand-offs never leak between pages. */
export default function TaskRoute({ hindi = false }: { hindi?: boolean }) {
  const { slug = '' } = useParams();
  const task = getTask(hindi ? `hi/${slug}` : slug);
  if (!task) return <NotFound />;
  return <TaskView key={task.slug} task={task} />;
}
