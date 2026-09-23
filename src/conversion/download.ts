import { sanitizeFilename, uniqueNames } from '@/utils/filename';

export interface OutputFile {
  name: string;
  blob: Blob;
}

type SavePickerWindow = Window & {
  showSaveFilePicker?: (opts: {
    suggestedName?: string;
    types?: { description?: string; accept: Record<string, string[]> }[];
  }) => Promise<FileSystemFileHandle>;
};

/** Standard browser download. The object URL is revoked after the download starts. */
export function downloadBlob(blob: Blob, name: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = sanitizeFilename(name);
  a.rel = 'noopener';
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 30_000);
}

export type SaveResult = 'saved' | 'downloaded' | 'cancelled';

/**
 * Save a single file. Uses the native save dialog when the user enabled it and
 * the browser supports it; otherwise falls back to a normal download.
 */
export async function saveFile(blob: Blob, name: string, opts: { useDialog?: boolean } = {}): Promise<SaveResult> {
  const w = window as SavePickerWindow;
  const safe = sanitizeFilename(name);
  if (opts.useDialog && typeof w.showSaveFilePicker === 'function') {
    try {
      const ext = safe.includes('.') ? '.' + safe.split('.').pop() : '';
      const handle = await w.showSaveFilePicker({
        suggestedName: safe,
        types: blob.type && ext ? [{ accept: { [blob.type]: [ext] } }] : undefined,
      });
      const writable = await (handle as FileSystemFileHandle & { createWritable: () => Promise<FileSystemWritableFileStream> }).createWritable();
      await writable.write(blob);
      await writable.close();
      return 'saved';
    } catch (err) {
      if ((err as DOMException)?.name === 'AbortError') return 'cancelled';
      // The picker failed (for example it rejected the type) — use a normal download.
    }
  }
  downloadBlob(blob, safe);
  return 'downloaded';
}

/** Bundle files into a ZIP. fflate is loaded only when needed. */
export async function zipFiles(files: OutputFile[]): Promise<Blob> {
  const { zip } = await import('fflate');
  const names = uniqueNames(files.map((f) => sanitizeFilename(f.name)));
  const entries: Record<string, [Uint8Array, { level: 0 | 6 }]> = {};
  for (let i = 0; i < files.length; i++) {
    const data = new Uint8Array(await files[i].blob.arrayBuffer());
    // Already-compressed formats gain nothing from deflate, so store them.
    const stored = /^(image\/(jpeg|png|webp|gif|avif)|application\/(zip|pdf)|video|audio)/.test(files[i].blob.type);
    entries[names[i]] = [data, { level: stored ? 0 : 6 }];
  }
  return new Promise((resolve, reject) => {
    zip(entries, (err, out) => (err ? reject(err) : resolve(new Blob([out], { type: 'application/zip' }))));
  });
}

export async function saveMany(files: OutputFile[], zipName: string, opts: { useDialog?: boolean } = {}): Promise<SaveResult> {
  if (files.length === 1) return saveFile(files[0].blob, files[0].name, opts);
  const blob = await zipFiles(files);
  return saveFile(blob, zipName.endsWith('.zip') ? zipName : `${zipName}.zip`, opts);
}

/** Copy text to the clipboard, with a legacy fallback. */
export async function copyText(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    try {
      const ta = document.createElement('textarea');
      ta.value = text;
      ta.style.position = 'fixed';
      ta.style.opacity = '0';
      document.body.appendChild(ta);
      ta.select();
      const ok = document.execCommand('copy');
      ta.remove();
      return ok;
    } catch {
      return false;
    }
  }
}
