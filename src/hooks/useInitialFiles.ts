import { useEffect, useRef } from 'react';

/**
 * Deliver files handed over from the universal drop zone exactly once, even
 * when React runs effects twice (StrictMode in development).
 */
export function useInitialFiles(files: File[] | undefined, deliver: (files: File[]) => unknown) {
  const done = useRef(false);
  const latest = useRef(deliver);
  latest.current = deliver;
  useEffect(() => {
    if (done.current || !files?.length) return;
    done.current = true;
    void latest.current(files);
  }, [files]);
}
