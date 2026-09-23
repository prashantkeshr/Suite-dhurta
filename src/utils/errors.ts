/**
 * User-facing errors. Tools throw `UserError` for problems they understand;
 * anything else is turned into a friendly message by `describeError`, with the
 * raw details kept for the expandable "Technical details" section.
 */

export interface FriendlyError {
  title: string;
  reasons: string[];
  suggestions: string[];
  technical?: string;
}

export class UserError extends Error {
  constructor(
    public title: string,
    public reasons: string[] = [],
    public suggestions: string[] = [],
    public cause?: unknown,
  ) {
    super(title);
    this.name = 'UserError';
  }
}

export const DEFAULT_REASONS = [
  'Unsupported format',
  'The file may be damaged',
  'A browser limitation',
  'The file is too large',
  'The required processing engine is unavailable',
];

export const DEFAULT_SUGGESTIONS = [
  'Open the file again',
  'Try another format',
  'Reduce the file size',
  'Use an up-to-date Chrome, Edge, Firefox or Safari',
];

function technicalText(err: unknown): string | undefined {
  if (err == null) return undefined;
  if (err instanceof Error) return `${err.name}: ${err.message}${err.stack ? `\n\n${err.stack.split('\n').slice(0, 6).join('\n')}` : ''}`;
  try {
    return typeof err === 'string' ? err : JSON.stringify(err);
  } catch {
    return String(err);
  }
}

export function describeError(err: unknown, fallbackTitle = 'Unable to process this file.'): FriendlyError {
  if (err instanceof UserError) {
    return { title: err.title, reasons: err.reasons, suggestions: err.suggestions, technical: technicalText(err.cause) };
  }
  const msg = err instanceof Error ? err.message : String(err ?? '');
  const name = err instanceof Error ? err.name : '';

  if (name === 'QuotaExceededError' || /out of memory|allocation failed|array buffer allocation/i.test(msg)) {
    return {
      title: 'Your browser ran out of memory.',
      reasons: ['The file is too large for this device', 'Too many files are being processed at once'],
      suggestions: ['Process fewer files at a time', 'Try a smaller file', 'Close other tabs and try again'],
      technical: technicalText(err),
    };
  }
  if (/encrypt/i.test(msg)) {
    return {
      title: 'This PDF is password-protected.',
      reasons: ['The document is encrypted'],
      suggestions: ['Open it in the app that created it with your password, save an unprotected copy, then try again'],
      technical: technicalText(err),
    };
  }
  if (name === 'EncodingError' || /decode|source image cannot be decoded|could not load image/i.test(msg)) {
    return {
      title: 'This image could not be decoded.',
      reasons: ['The format is not supported by this browser (for example HEIC)', 'The file may be damaged or not actually an image'],
      suggestions: ['Convert it to JPEG or PNG with another app first', 'Try a different browser'],
      technical: technicalText(err),
    };
  }
  return { title: fallbackTitle, reasons: DEFAULT_REASONS, suggestions: DEFAULT_SUGGESTIONS, technical: technicalText(err) };
}

export const isAbort = (err: unknown) => (err as DOMException)?.name === 'AbortError';

export function throwIfAborted(signal?: AbortSignal) {
  if (signal?.aborted) throw new DOMException('Cancelled', 'AbortError');
}
