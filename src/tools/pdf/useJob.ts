import { useCallback, useEffect, useRef, useState } from 'react';
import { isAbort } from '@/utils/errors';

/**
 * State for a single long-running operation (merge, split…): real progress
 * when reported, cancellation, and a captured error for ErrorState.
 */
export function useJob<T>() {
  const [running, setRunning] = useState(false);
  const [progress, setProgress] = useState<number | null>(null);
  const [step, setStep] = useState<string>();
  const [error, setError] = useState<unknown>(null);
  const [result, setResult] = useState<T | null>(null);
  const controller = useRef<AbortController | null>(null);

  useEffect(() => () => controller.current?.abort(), []);

  const run = useCallback(async (fn: (signal: AbortSignal, report: (v: number | null, s?: string) => void) => Promise<T>) => {
    controller.current?.abort();
    const c = new AbortController();
    controller.current = c;
    setRunning(true);
    setError(null);
    setResult(null);
    setProgress(null);
    setStep(undefined);
    try {
      const r = await fn(c.signal, (v, s) => {
        if (c.signal.aborted) return;
        setProgress(v);
        if (s) setStep(s);
      });
      if (!c.signal.aborted) setResult(r);
      return r;
    } catch (err) {
      if (!isAbort(err) && !c.signal.aborted) setError(err);
      return null;
    } finally {
      if (controller.current === c) {
        setRunning(false);
        controller.current = null;
      }
    }
  }, []);

  const cancel = useCallback(() => {
    controller.current?.abort();
    controller.current = null;
    setRunning(false);
    setProgress(null);
    setStep(undefined);
  }, []);

  const reset = useCallback(() => {
    setError(null);
    setResult(null);
  }, []);

  return { running, progress, step, error, result, run, cancel, reset };
}
