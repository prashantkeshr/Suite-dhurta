/**
 * Reusable processing queue. Each job runs a task with an AbortSignal and a
 * progress callback. Progress stays `null` unless the task reports a real
 * value, so the UI shows "Processing…" instead of an invented percentage.
 */

export type JobStatus = 'queued' | 'processing' | 'complete' | 'failed' | 'cancelled';

export interface JobContext {
  signal: AbortSignal;
  /** Report real progress in [0, 1] plus an optional step description. */
  progress: (value: number | null, step?: string) => void;
}

export interface Job<I, O> {
  id: string;
  input: I;
  label: string;
  status: JobStatus;
  progress: number | null;
  step?: string;
  result?: O;
  error?: unknown;
}

export type Task<I, O> = (input: I, ctx: JobContext) => Promise<O>;

let counter = 0;
const newId = () => `job-${Date.now().toString(36)}-${(counter++).toString(36)}`;

export class ProcessingQueue<I, O> {
  private jobs: Job<I, O>[] = [];
  private controllers = new Map<string, AbortController>();
  private listeners = new Set<() => void>();
  private running = 0;
  private paused = false;

  constructor(
    private task: Task<I, O>,
    private concurrency = 2,
  ) {}

  subscribe(fn: () => void): () => void {
    this.listeners.add(fn);
    return () => {
      this.listeners.delete(fn);
    };
  }

  getJobs(): Job<I, O>[] {
    return this.jobs;
  }

  isPaused() {
    return this.paused;
  }

  setTask(task: Task<I, O>) {
    this.task = task;
  }

  private emit() {
    this.listeners.forEach((l) => l());
  }

  private patch(id: string, p: Partial<Job<I, O>>) {
    this.jobs = this.jobs.map((j) => (j.id === id ? { ...j, ...p } : j));
    this.emit();
  }

  add(inputs: I[], label: (input: I) => string): string[] {
    const created: Job<I, O>[] = inputs.map((input) => ({ id: newId(), input, label: label(input), status: 'queued', progress: null }));
    this.jobs = [...this.jobs, ...created];
    this.emit();
    this.pump();
    return created.map((j) => j.id);
  }

  /** Put jobs back in the queue to run again (e.g. after settings changed). */
  rerun(ids?: string[]) {
    this.jobs = this.jobs.map((j) =>
      (!ids || ids.includes(j.id)) && j.status !== 'processing'
        ? { ...j, status: 'queued' as const, progress: null, step: undefined, result: undefined, error: undefined }
        : j,
    );
    this.emit();
    this.pump();
  }

  retry(id: string) {
    this.rerun([id]);
  }

  cancel(id: string) {
    const job = this.jobs.find((j) => j.id === id);
    if (!job) return;
    if (job.status === 'processing') this.controllers.get(id)?.abort();
    if (job.status === 'queued' || job.status === 'processing') this.patch(id, { status: 'cancelled', progress: null, step: undefined });
  }

  cancelAll() {
    this.jobs.forEach((j) => this.cancel(j.id));
  }

  remove(id: string) {
    this.cancel(id);
    this.jobs = this.jobs.filter((j) => j.id !== id);
    this.emit();
  }

  clearCompleted() {
    this.jobs = this.jobs.filter((j) => j.status !== 'complete');
    this.emit();
  }

  clear() {
    this.cancelAll();
    this.jobs = [];
    this.emit();
  }

  pause() {
    this.paused = true;
    this.emit();
  }

  resume() {
    this.paused = false;
    this.emit();
    this.pump();
  }

  /** Resolves once no job is queued or processing (or the queue is paused). */
  idle(): Promise<void> {
    return new Promise((resolve) => {
      let unsub = () => {};
      const check = () => {
        const busy = this.jobs.some((j) => j.status === 'processing' || (j.status === 'queued' && !this.paused));
        if (!busy) {
          unsub();
          resolve();
        }
      };
      unsub = this.subscribe(check);
      check();
    });
  }

  private pump() {
    while (!this.paused && this.running < this.concurrency) {
      const next = this.jobs.find((j) => j.status === 'queued');
      if (!next) return;
      void this.run(next);
    }
  }

  private async run(job: Job<I, O>) {
    const controller = new AbortController();
    this.controllers.set(job.id, controller);
    this.running++;
    this.patch(job.id, { status: 'processing', progress: null, step: undefined });
    try {
      const result = await this.task(job.input, {
        signal: controller.signal,
        progress: (value, step) => {
          if (controller.signal.aborted) return;
          this.patch(job.id, { progress: value == null ? null : Math.max(0, Math.min(1, value)), step });
        },
      });
      if (!controller.signal.aborted) this.patch(job.id, { status: 'complete', progress: 1, result, step: undefined });
    } catch (error) {
      if (!controller.signal.aborted) this.patch(job.id, { status: 'failed', error, progress: null, step: undefined });
    } finally {
      this.running--;
      this.controllers.delete(job.id);
      this.pump();
    }
  }
}
