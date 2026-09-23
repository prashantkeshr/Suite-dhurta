import { describe, expect, it } from 'vitest';
import { ProcessingQueue } from './queue';

const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));

describe('processing queue', () => {
  it('processes jobs and stores results', async () => {
    const q = new ProcessingQueue<number, number>(async (n) => n * 2, 2);
    q.add([1, 2, 3], String);
    await q.idle();
    expect(q.getJobs().map((j) => [j.status, j.result])).toEqual([
      ['complete', 2],
      ['complete', 4],
      ['complete', 6],
    ]);
  });

  it('respects the concurrency limit', async () => {
    let running = 0;
    let peak = 0;
    const q = new ProcessingQueue<number, void>(async () => {
      running++;
      peak = Math.max(peak, running);
      await wait(10);
      running--;
    }, 2);
    q.add([1, 2, 3, 4, 5], String);
    await q.idle();
    expect(peak).toBe(2);
  });

  it('never invents progress: it stays null unless reported', async () => {
    const seen: (number | null)[] = [];
    const q = new ProcessingQueue<number, void>(async (_n, ctx) => {
      await wait(5);
      ctx.progress(0.5, 'half');
      await wait(5);
    }, 1);
    q.subscribe(() => {
      const j = q.getJobs()[0];
      if (j?.status === 'processing') seen.push(j.progress);
    });
    q.add([1], String);
    await q.idle();
    expect(seen[0]).toBeNull();
    expect(seen).toContain(0.5);
  });

  it('marks failures and can retry them', async () => {
    let attempts = 0;
    const q = new ProcessingQueue<number, string>(async () => {
      attempts++;
      if (attempts === 1) throw new Error('fail once');
      return 'ok';
    }, 1);
    const [id] = q.add([1], String);
    await q.idle();
    expect(q.getJobs()[0].status).toBe('failed');
    q.retry(id);
    await q.idle();
    expect(q.getJobs()[0]).toMatchObject({ status: 'complete', result: 'ok' });
  });

  it('cancels a running job via its AbortSignal', async () => {
    let aborted = false;
    const q = new ProcessingQueue<number, void>(
      (_n, ctx) =>
        new Promise((_resolve, reject) => {
          ctx.signal.addEventListener('abort', () => {
            aborted = true;
            reject(new DOMException('x', 'AbortError'));
          });
        }),
      1,
    );
    const [id] = q.add([1], String);
    await wait(1);
    q.cancel(id);
    await q.idle();
    expect(aborted).toBe(true);
    expect(q.getJobs()[0].status).toBe('cancelled');
  });

  it('pauses and resumes', async () => {
    const q = new ProcessingQueue<number, number>(async (n) => n, 1);
    q.pause();
    q.add([1, 2], String);
    await wait(5);
    expect(q.getJobs().every((j) => j.status === 'queued')).toBe(true);
    q.resume();
    await q.idle();
    expect(q.getJobs().every((j) => j.status === 'complete')).toBe(true);
  });

  it('removes jobs and clears completed ones', async () => {
    const q = new ProcessingQueue<number, number>(async (n) => n, 1);
    const [a] = q.add([1, 2], String);
    await q.idle();
    q.remove(a);
    expect(q.getJobs()).toHaveLength(1);
    q.clearCompleted();
    expect(q.getJobs()).toHaveLength(0);
  });
});
