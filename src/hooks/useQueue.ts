import { useEffect, useRef, useSyncExternalStore } from 'react';
import { ProcessingQueue, type Task } from '@/queue/queue';

/**
 * Create a queue bound to a component. The latest `task` closure is always
 * used, so jobs pick up the current settings. Jobs are cancelled on unmount.
 */
export function useQueue<I, O>(task: Task<I, O>, concurrency = 2) {
  const ref = useRef<ProcessingQueue<I, O>>();
  if (!ref.current) ref.current = new ProcessingQueue<I, O>(task, concurrency);
  const queue = ref.current;
  queue.setTask(task);

  useEffect(() => () => queue.clear(), [queue]);

  const jobs = useSyncExternalStore(
    (cb) => queue.subscribe(cb),
    () => queue.getJobs(),
  );
  return { queue, jobs, paused: queue.isPaused() };
}
