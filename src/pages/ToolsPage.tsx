import { useMemo, useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { Search } from 'lucide-react';
import { CATEGORIES, TOOLS, getCategory, toolsInCategory, isUsable, sortTools } from '@/tools/registry';
import { searchTools } from '@/search/search';
import { useDocumentMeta } from '@/hooks/useDocumentMeta';
import { t } from '@/i18n';
import { Segmented } from '@/components/ui/primitives';
import { EmptyState } from '@/components/ui/states';
import { Breadcrumb } from '@/components/tools/common';
import { ToolGrid } from '@/components/tools/ToolCard';

type Filter = 'all' | 'available' | 'soon';

function applyFilter<T extends { status: string }>(list: T[], f: Filter) {
  if (f === 'available') return list.filter((x) => isUsable(x as never));
  if (f === 'soon') return list.filter((x) => !isUsable(x as never));
  return list;
}

export function AllToolsPage() {
  useDocumentMeta('All tools', 'Every tool in the suite, grouped by category, with availability status.', '/tools');
  const [q, setQ] = useState('');
  const [filter, setFilter] = useState<Filter>('all');
  const results = useMemo(() => (q.trim() ? searchTools(q, 100).map((r) => r.tool) : null), [q]);

  return (
    <div>
      <Breadcrumb items={[{ label: t('nav.home'), to: '/' }, { label: t('home.all') }]} />
      <h1 className="text-2xl font-semibold tracking-tight">{t('home.all')}</h1>
      <p className="mt-1 text-muted">
        {TOOLS.filter(isUsable).length} available now, {TOOLS.filter((x) => !isUsable(x)).length} planned. Planned tools are clearly marked and have no upload form.
      </p>
      <div className="mt-5 flex flex-col gap-3 sm:flex-row sm:items-end">
        <div className="relative flex-1">
          <label htmlFor="tools-filter" className="sr-only">
            Filter tools
          </label>
          <Search size={16} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted" aria-hidden />
          <input id="tools-filter" className="input pl-9" placeholder="Filter by name, action or file type…" value={q} onChange={(e) => setQ(e.target.value)} />
        </div>
        <Segmented label="Show" value={filter} onChange={setFilter} options={[{ value: 'all', label: 'All' }, { value: 'available', label: 'Available' }, { value: 'soon', label: 'Coming soon' }]} />
      </div>

      {results ? (
        <div className="mt-6">{applyFilter(results, filter).length ? <ToolGrid tools={applyFilter(results, filter)} /> : <EmptyState title={t('search.empty', { q })} body={t('search.hint')} />}</div>
      ) : (
        <div className="mt-6 space-y-8">
          {CATEGORIES.map((c) => {
            const list = applyFilter(toolsInCategory(c.id), filter);
            if (!list.length) return null;
            return (
              <section key={c.id} aria-labelledby={`cat-${c.id}`}>
                <div className="mb-3 flex items-baseline justify-between">
                  <h2 id={`cat-${c.id}`} className="text-base font-semibold">
                    {c.name}
                  </h2>
                  <Link to={`/category/${c.id}`} className="text-xs text-muted hover:text-fg">
                    View category
                  </Link>
                </div>
                <ToolGrid tools={list} dense />
              </section>
            );
          })}
        </div>
      )}
    </div>
  );
}

export function CategoryPage() {
  const { id = '' } = useParams();
  const category = getCategory(id);
  useDocumentMeta(category ? `${category.name} tools` : 'Category not found', category?.description, category ? `/category/${category.id}` : undefined);
  if (!category) return <EmptyState title="Category not found" action={<Link to="/tools" className="link">{t('home.all')}</Link>} />;
  const list = sortTools(toolsInCategory(category.id));
  const usable = list.filter(isUsable);
  const soon = list.filter((x) => !isUsable(x));
  return (
    <div>
      <Breadcrumb items={[{ label: t('nav.home'), to: '/' }, { label: category.name }]} />
      <h1 className="text-2xl font-semibold tracking-tight">{category.name}</h1>
      <p className="mt-1 text-muted">{category.description}</p>
      {usable.length > 0 && (
        <section className="mt-6">
          <ToolGrid tools={usable} />
        </section>
      )}
      {soon.length > 0 && (
        <section className="mt-8" aria-labelledby="soon-title">
          <h2 id="soon-title" className="section-title">
            {t('status.coming-soon')}
          </h2>
          <ToolGrid tools={soon} dense />
        </section>
      )}
      {list.length === 0 && <EmptyState title="No tools in this category yet" />}
    </div>
  );
}
