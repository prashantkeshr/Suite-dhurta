import { useCallback, useEffect, useRef, useState, type DragEvent } from 'react';
import { clsx } from 'clsx';
import { Upload } from 'lucide-react';
import { LIMITS } from '@/app/config';
import { registerOpenFile } from '@/app/shortcuts';
import { formatBytes } from '@/utils/format';
import { t } from '@/i18n';
import { Button } from '@/components/ui/primitives';
import { Dialog } from '@/components/ui/Dialog';
import { toast } from '@/components/ui/Toast';

type Entry = { isFile: boolean; isDirectory: boolean; name: string; file?: (cb: (f: File) => void, err: (e: unknown) => void) => void; createReader?: () => { readEntries: (cb: (e: Entry[]) => void, err: (e: unknown) => void) => void } };

/** Recursively read files from a dropped folder (Chromium, Firefox, Safari). */
async function readEntry(entry: Entry, out: File[], depth = 0): Promise<void> {
  if (depth > 8 || out.length > 2000) return;
  if (entry.isFile && entry.file) {
    await new Promise<void>((resolve) => entry.file!((f) => (out.push(f), resolve()), () => resolve()));
  } else if (entry.isDirectory && entry.createReader) {
    const reader = entry.createReader();
    // readEntries returns results in batches; call until empty.
    for (;;) {
      const batch = await new Promise<Entry[]>((resolve) => reader.readEntries(resolve, () => resolve([])));
      if (batch.length === 0) break;
      for (const e of batch) await readEntry(e, out, depth + 1);
    }
  }
}

async function filesFromDrop(e: DragEvent): Promise<File[]> {
  const items = Array.from(e.dataTransfer.items ?? []);
  const entries = items
    .filter((i) => i.kind === 'file')
    .map((i) => i.webkitGetAsEntry?.() as unknown as Entry | null)
    .filter((x): x is Entry => !!x);
  if (entries.length > 0 && entries.some((x) => x.isDirectory)) {
    const out: File[] = [];
    for (const entry of entries) await readEntry(entry, out);
    return out;
  }
  return Array.from(e.dataTransfer.files ?? []);
}

export interface FileDropzoneProps {
  onFiles: (files: File[]) => void;
  accept?: string;
  multiple?: boolean;
  acceptLabel?: string;
  compact?: boolean;
  className?: string;
  /** Override the large-file thresholds for this tool. */
  warnBytes?: number;
}

export function FileDropzone({ onFiles, accept, multiple = true, acceptLabel, compact, className, warnBytes = LIMITS.warnBytes }: FileDropzoneProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);
  const [pending, setPending] = useState<File[] | null>(null);
  const depth = useRef(0);

  useEffect(() => registerOpenFile(() => inputRef.current?.click()), []);

  const deliver = useCallback(
    (list: File[]) => {
      if (list.length === 0) return;
      const tooLarge = list.filter((f) => f.size > LIMITS.hardBytes);
      if (tooLarge.length) toast.error(t('largeFile.tooLarge'), tooLarge.map((f) => `${f.name} (${formatBytes(f.size)})`).join(', '));
      const ok = list.filter((f) => f.size <= LIMITS.hardBytes);
      const files = multiple ? ok : ok.slice(0, 1);
      if (files.length === 0) return;
      if (files.some((f) => f.size > warnBytes)) setPending(files);
      else onFiles(files);
    },
    [multiple, onFiles, warnBytes],
  );

  const onDrop = async (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    depth.current = 0;
    setDragging(false);
    deliver(await filesFromDrop(e));
  };

  const largest = pending ? Math.max(...pending.map((f) => f.size)) : 0;

  return (
    <>
      <div
        onDragEnter={(e) => {
          e.preventDefault();
          depth.current++;
          setDragging(true);
        }}
        onDragOver={(e) => e.preventDefault()}
        onDragLeave={() => {
          depth.current--;
          if (depth.current <= 0) setDragging(false);
        }}
        onDrop={onDrop}
        className={clsx(
          'relative flex flex-col items-center justify-center rounded-xl border-2 border-dashed text-center transition-colors',
          compact ? 'px-4 py-5' : 'px-6 py-10 sm:py-12',
          dragging ? 'border-accent bg-accent/5' : 'border-line bg-surface hover:border-accent/50',
          className,
        )}
      >
        <Upload size={compact ? 22 : 30} strokeWidth={1.5} className={clsx('mb-2', dragging ? 'text-accent' : 'text-muted')} aria-hidden />
        <p className="font-medium text-fg">{dragging ? t('drop.active') : t('drop.title')}</p>
        {!dragging && (
          <>
            <p className="my-1.5 text-xs text-muted">{t('drop.or')}</p>
            <Button variant="primary" onClick={() => inputRef.current?.click()}>
              {t('drop.choose')}
            </Button>
          </>
        )}
        <p className="mt-3 text-xs text-muted">{acceptLabel ? t('drop.accepts', { types: acceptLabel }) : t('drop.anything')}</p>
        <input
          ref={inputRef}
          type="file"
          className="sr-only"
          tabIndex={-1}
          aria-hidden
          accept={accept}
          multiple={multiple}
          onChange={(e) => {
            deliver(Array.from(e.target.files ?? []));
            e.target.value = '';
          }}
        />
      </div>
      <Dialog
        open={!!pending}
        onClose={() => setPending(null)}
        title={t('largeFile.title')}
        footer={
          <>
            <Button onClick={() => setPending(null)}>{t('action.cancel')}</Button>
            <Button
              variant="primary"
              data-autofocus
              onClick={() => {
                if (pending) onFiles(pending);
                setPending(null);
              }}
            >
              {t('action.continue')}
            </Button>
          </>
        }
      >
        <p className="text-sm text-muted">{t('largeFile.body', { size: formatBytes(largest) })}</p>
        <p className="mt-2 text-sm text-muted">On phones and older computers the browser tab may close if it runs out of memory. Nothing is lost — your original file is untouched.</p>
      </Dialog>
    </>
  );
}
