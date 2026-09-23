import { Link } from 'react-router-dom';
import { clsx } from 'clsx';
import { Star } from 'lucide-react';
import type { ToolDefinition } from '@/types/tool';
import { Icon } from '@/components/ui/Icon';
import { StatusBadge } from '@/components/ui/primitives';
import { useStore } from '@/storage/store';
import { isUsable } from '@/tools/registry';
import { t } from '@/i18n';

export function ToolCard({ tool, dense }: { tool: ToolDefinition; dense?: boolean }) {
  const favorite = useStore((s) => s.favorites.includes(tool.id));
  const toggle = useStore((s) => s.toggleFavorite);
  const usable = isUsable(tool);
  return (
    <div className={clsx('card group relative flex gap-3 transition-colors hover:border-accent/50', dense ? 'p-3' : 'p-4', !usable && 'opacity-80')}>
      <div className={clsx('flex h-9 w-9 shrink-0 items-center justify-center rounded-md', usable ? 'bg-accent/10 text-accent' : 'bg-surface2 text-muted')}>
        <Icon name={tool.icon} size={18} />
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1 pr-6">
          <Link to={`/tools/${tool.id}`} className="font-medium text-fg after:absolute after:inset-0 after:content-[''] focus-visible:outline-none">
            {tool.name}
          </Link>
          <StatusBadge status={tool.status} hideAvailable />
          {tool.processing === 'external' && <span className="text-[10.5px] font-semibold uppercase text-warning">External</span>}
        </div>
        {!dense && <p className="mt-0.5 line-clamp-2 text-[13px] text-muted">{tool.description}</p>}
      </div>
      <button
        onClick={() => toggle(tool.id)}
        aria-pressed={favorite}
        aria-label={`${favorite ? t('tool.unfavorite') : t('tool.favorite')}: ${tool.name}`}
        className={clsx(
          'absolute right-2 top-2 z-10 rounded p-1.5 transition-opacity',
          favorite ? 'text-warning' : 'text-muted opacity-100 md:opacity-0 md:group-hover:opacity-100 focus-visible:opacity-100',
        )}
      >
        <Star size={15} fill={favorite ? 'currentColor' : 'none'} />
      </button>
    </div>
  );
}

export function ToolGrid({ tools, dense }: { tools: ToolDefinition[]; dense?: boolean }) {
  return (
    <div className={clsx('grid gap-3', dense ? 'grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4' : 'grid-cols-1 sm:grid-cols-2 xl:grid-cols-3')}>
      {tools.map((tool) => (
        <ToolCard key={tool.id} tool={tool} dense={dense} />
      ))}
    </div>
  );
}
