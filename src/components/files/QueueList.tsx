import type { ReactNode } from 'react';
import { clsx } from 'clsx';
import { CheckCircle2, Circle, Loader2, XCircle, Ban, RotateCcw, X, Pause, Play, Download } from 'lucide-react';
import type { Job, ProcessingQueue } from '@/queue/queue';
import { describeError } from '@/utils/errors';
import { t } from '@/i18n';
import { Button, Progress } from '@/components/ui/primitives';

const STATUS_ICON = {
  queued: <Circle size={16} className="text-muted" aria-hidden />,
  processing: <Loader2 size={16} className="animate-spin text-accent" aria-hidden />,
  complete: <CheckCircle2 size={16} className="text-success" aria-hidden />,
  failed: <XCircle size={16} className="text-error" aria-hidden />,
  cancelled: <Ban size={16} className="text-muted" aria-hidden />,
};

const STATUS_LABEL = {
  queued: t('queue.queued'),
  processing: t('queue.processing'),
  complete: t('queue.complete'),
  failed: t('queue.failed'),
  cancelled: t('queue.cancelled'),
};

export interface QueueListProps<I, O> {
  queue: ProcessingQueue<I, O>;
  jobs: Job<I, O>[];
  /** Extra detail for a completed job (sizes, dimensions...). */
  renderResult?: (job: Job<I, O>) => ReactNode;
  onDownload?: (job: Job<I, O>) => void;
  /** Leading thumbnail/icon per job. */
  renderThumb?: (job: Job<I, O>) => ReactNode;
}

export function QueueList<I, O>({ queue, jobs, renderResult, onDownload, renderThumb }: QueueListProps<I, O>) {
  const counts = jobs.reduce(
    (acc, j) => ((acc[j.status] = (acc[j.status] ?? 0) + 1), acc),
    {} as Record<string, number>,
  );
  const active = (counts.queued ?? 0) + (counts.processing ?? 0);
  const paused = queue.isPaused();

  return (
    <section aria-label="Processing queue" className="card overflow-hidden">
      <header className="flex flex-wrap items-center justify-between gap-2 border-b border-line px-4 py-2.5">
        <p className="text-sm font-medium" aria-live="polite">
          {jobs.length} file{jobs.length === 1 ? '' : 's'}
          {counts.complete ? ` · ${counts.complete} complete` : ''}
          {counts.failed ? ` · ${counts.failed} failed` : ''}
          {active ? ` · ${active} remaining` : ''}
        </p>
        <div className="flex flex-wrap gap-1.5">
          {active > 0 &&
            (paused ? (
              <Button size="sm" icon={<Play size={14} />} onClick={() => queue.resume()}>
                Resume
              </Button>
            ) : (
              <Button size="sm" icon={<Pause size={14} />} onClick={() => queue.pause()}>
                Pause
              </Button>
            ))}
          {active > 0 && (
            <Button size="sm" onClick={() => queue.cancelAll()}>
              {t('action.cancel')}
            </Button>
          )}
          {counts.complete ? (
            <Button size="sm" variant="ghost" onClick={() => queue.clearCompleted()}>
              {t('queue.clearCompleted')}
            </Button>
          ) : null}
        </div>
      </header>
      <ul className="divide-y divide-line">
        {jobs.map((job) => (
          <li key={job.id} className="flex items-center gap-3 px-4 py-3">
            {renderThumb ? renderThumb(job) : STATUS_ICON[job.status]}
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2">
                {renderThumb && STATUS_ICON[job.status]}
                <p className="truncate text-sm font-medium" title={job.label}>
                  {job.label}
                </p>
              </div>
              <div className="mt-0.5 text-xs text-muted">
                {job.status === 'processing' ? (
                  <div className="mt-1.5 max-w-xs">
                    <Progress value={job.progress} label={`Processing ${job.label}`} />
                    <p className="mt-1">{job.step ?? t('queue.processing')}{typeof job.progress === 'number' ? ` ${Math.round(job.progress * 100)}%` : ''}</p>
                  </div>
                ) : job.status === 'complete' && renderResult ? (
                  renderResult(job)
                ) : job.status === 'failed' ? (
                  <span className="text-error">{describeError(job.error).title}</span>
                ) : (
                  STATUS_LABEL[job.status]
                )}
              </div>
            </div>
            <div className="flex shrink-0 gap-1">
              {job.status === 'complete' && onDownload && (
                <Button size="sm" variant="secondary" icon={<Download size={14} />} onClick={() => onDownload(job)} aria-label={`${t('action.download')} ${job.label}`}>
                  <span className="hidden sm:inline">{t('action.download')}</span>
                </Button>
              )}
              {(job.status === 'failed' || job.status === 'cancelled') && (
                <IconBtn label={`${t('action.retry')} ${job.label}`} onClick={() => queue.retry(job.id)}>
                  <RotateCcw size={15} />
                </IconBtn>
              )}
              {(job.status === 'processing' || job.status === 'queued') && (
                <IconBtn label={`${t('action.cancel')} ${job.label}`} onClick={() => queue.cancel(job.id)}>
                  <Ban size={15} />
                </IconBtn>
              )}
              <IconBtn label={`${t('action.remove')} ${job.label}`} onClick={() => queue.remove(job.id)}>
                <X size={15} />
              </IconBtn>
            </div>
          </li>
        ))}
      </ul>
    </section>
  );
}

function IconBtn({ label, onClick, children }: { label: string; onClick: () => void; children: ReactNode }) {
  return (
    <button onClick={onClick} aria-label={label} title={label} className={clsx('flex h-9 w-9 items-center justify-center rounded-md text-muted hover:bg-surface2 hover:text-fg')}>
      {children}
    </button>
  );
}
