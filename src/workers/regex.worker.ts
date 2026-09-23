/**
 * Runs user-supplied regular expressions off the main thread. A pathological
 * pattern (catastrophic backtracking) can then be stopped by terminating the
 * worker instead of freezing the page.
 */
const scope = self as unknown as { postMessage: (msg: unknown) => void; onmessage: ((e: MessageEvent) => void) | null };

const MAX_MATCHES = 1000;

scope.onmessage = (e: MessageEvent<{ pattern: string; flags: string; text: string }>) => {
  const { pattern, flags, text } = e.data;
  try {
    const re = new RegExp(pattern, flags.includes('g') ? flags : flags + 'g');
    const matches: { index: number; end: number; text: string; groups: (string | undefined)[]; named?: Record<string, string> }[] = [];
    let m: RegExpExecArray | null;
    while ((m = re.exec(text)) && matches.length < MAX_MATCHES) {
      matches.push({ index: m.index, end: m.index + m[0].length, text: m[0], groups: m.slice(1), named: m.groups ? { ...m.groups } : undefined });
      if (m[0].length === 0) re.lastIndex++; // avoid infinite loop on empty matches
      if (!flags.includes('g')) break;
    }
    scope.postMessage({ ok: true, matches, truncated: matches.length >= MAX_MATCHES });
  } catch (err) {
    scope.postMessage({ ok: false, error: (err as Error).message });
  }
};
