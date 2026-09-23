import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { AlertOctagon, Clock, Inbox, RotateCcw, ShieldCheck, ExternalLink, Check, Bell, BellOff } from 'lucide-react';
import type { ToolDefinition } from '@/types/tool';
import { describeError, type FriendlyError } from '@/utils/errors';
import { getCategory } from '@/tools/registry';
import { useStore } from '@/storage/store';
import { t } from '@/i18n';
import { Button, Card } from './primitives';

export function EmptyState({ icon, title, body, action }: { icon?: ReactNode; title: string; body?: string; action?: ReactNode }) {
  return (
    <div className="flex flex-col items-center justify-center rounded-lg border border-dashed border-line px-6 py-10 text-center">
      <div className="mb-3 text-muted">{icon ?? <Inbox size={28} strokeWidth={1.5} />}</div>
      <p className="font-medium text-fg">{title}</p>
      {body && <p className="mt-1 max-w-sm text-sm text-muted">{body}</p>}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}

export function ErrorState({ error, friendly, onRetry, actions }: { error?: unknown; friendly?: FriendlyError; onRetry?: () => void; actions?: ReactNode }) {
  const e = friendly ?? describeError(error);
  return (
    <div role="alert" className="rounded-lg border border-error/30 bg-error/5 p-4">
      <div className="flex items-start gap-3">
        <AlertOctagon size={20} className="mt-0.5 shrink-0 text-error" aria-hidden />
        <div className="min-w-0 flex-1 text-sm">
          <p className="font-semibold text-fg">{e.title}</p>
          {e.reasons.length > 0 && (
            <>
              <p className="mt-3 font-medium text-fg">{t('error.reasons')}</p>
              <ul className="mt-1 list-disc space-y-0.5 pl-5 text-muted">
                {e.reasons.map((r) => (
                  <li key={r}>{r}</li>
                ))}
              </ul>
            </>
          )}
          {e.suggestions.length > 0 && (
            <>
              <p className="mt-3 font-medium text-fg">{t('error.try')}</p>
              <ol className="mt-1 list-decimal space-y-0.5 pl-5 text-muted">
                {e.suggestions.map((s) => (
                  <li key={s}>{s}</li>
                ))}
              </ol>
            </>
          )}
          {(onRetry || actions) && (
            <div className="mt-4 flex flex-wrap gap-2">
              {onRetry && (
                <Button size="sm" onClick={onRetry} icon={<RotateCcw size={14} />}>
                  {t('action.retry')}
                </Button>
              )}
              {actions}
            </div>
          )}
          {e.technical && (
            <details className="mt-4">
              <summary className="cursor-pointer text-xs font-medium text-muted hover:text-fg">{t('error.details')}</summary>
              <pre className="mt-2 max-h-48 overflow-auto whitespace-pre-wrap break-all rounded bg-surface2 p-2 font-mono text-[11px] text-muted">{e.technical}</pre>
            </details>
          )}
        </div>
      </div>
    </div>
  );
}

/** Professional "coming soon" page. Deliberately has no upload form. */
export function ComingSoon({ tool }: { tool: ToolDefinition }) {
  const category = getCategory(tool.category);
  const notify = useStore((s) => s.notify);
  const toggleNotify = useStore((s) => s.toggleNotify);
  const watching = notify.includes(tool.id);
  return (
    <Card className="mx-auto max-w-xl px-6 py-10 text-center">
      <Clock size={32} strokeWidth={1.5} className="mx-auto text-muted" aria-hidden />
      <h2 className="mt-4 text-lg font-semibold uppercase tracking-wide text-fg">{tool.name}</h2>
      <p className="mt-1 text-xs font-semibold uppercase tracking-[0.2em] text-muted">{t('comingSoon.title')}</p>
      {tool.reason && <p className="mx-auto mt-4 max-w-md text-sm text-muted">{tool.reason}</p>}
      <div className="mt-6 flex flex-wrap justify-center gap-2">
        <Button onClick={() => toggleNotify(tool.id)} icon={watching ? <BellOff size={16} /> : <Bell size={16} />} aria-pressed={watching}>
          {watching ? 'Stop reminding me' : t('comingSoon.notify')}
        </Button>
        {category && (
          <Link to={`/category/${category.id}`}>
            <Button variant="primary">{t('comingSoon.browse', { category: category.name })}</Button>
          </Link>
        )}
      </div>
      {watching && <p className="mt-3 text-xs text-muted">{t('comingSoon.notified')} Stored only in this browser.</p>}
    </Card>
  );
}

/** Honest processing notice: local tools show the privacy guarantees, external tools name the service. */
export function ProcessingNotice({ tool, compact }: { tool: ToolDefinition; compact?: boolean }) {
  if (tool.processing === 'external' && tool.externalService) {
    return (
      <div className="flex items-start gap-3 rounded-lg border border-warning/30 bg-warning/5 p-3 text-sm">
        <ExternalLink size={18} className="mt-0.5 shrink-0 text-warning" aria-hidden />
        <div>
          <p className="font-semibold text-fg">{t('processing.external')}: {tool.externalService.name}</p>
          <p className="text-muted">
            This tool runs on {tool.externalService.name} ({tool.externalService.url}), not inside this app. Their privacy policy applies.
          </p>
        </div>
      </div>
    );
  }
  if (compact) {
    return (
      <span className="inline-flex items-center gap-1.5 text-xs font-medium text-success">
        <ShieldCheck size={14} aria-hidden /> {t('processing.local')}
      </span>
    );
  }
  return (
    <div className="flex items-start gap-3 rounded-lg border border-success/25 bg-success/5 p-3 text-sm">
      <ShieldCheck size={18} className="mt-0.5 shrink-0 text-success" aria-hidden />
      <div>
        <p className="text-xs font-semibold uppercase tracking-wide text-success">{t('processing.local')}</p>
        <p className="mt-0.5 text-fg">{t('privacy.local.body')}</p>
        <ul className="mt-1.5 flex flex-wrap gap-x-4 gap-y-1 text-muted">
          {[t('privacy.noUpload'), t('privacy.noAccount'), t('privacy.noServer')].map((x) => (
            <li key={x} className="inline-flex items-center gap-1">
              <Check size={13} className="text-success" aria-hidden /> {x}
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
