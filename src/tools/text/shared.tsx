import { useEffect, useRef } from 'react';
import { FileUp } from 'lucide-react';
import { Button } from '@/components/ui/primitives';
import { toast } from '@/components/ui/Toast';
import { formatBytes } from '@/utils/format';
import { looksLikeText } from '@/filesystem/detect';

const MAX_TEXT_BYTES = 20 * 1024 * 1024;

/** Read a text file as UTF-8 (BOM stripped). Rejects binary files. */
export async function readTextFile(file: File): Promise<string> {
  if (file.size > MAX_TEXT_BYTES) throw new Error(`${file.name} is ${formatBytes(file.size)}; text tools accept up to ${formatBytes(MAX_TEXT_BYTES)}.`);
  const buf = new Uint8Array(await file.arrayBuffer());
  if (buf.length && !looksLikeText(buf.subarray(0, 8192))) throw new Error(`${file.name} does not look like a text file.`);
  return new TextDecoder('utf-8').decode(buf);
}

/** "Open file" button that loads a text file into a tool, plus initial hand-off files. */
export function OpenTextButton({ onText, accept = '.txt,.md,.csv,.json,.xml,.html,.log,text/*', initialFiles }: { onText: (text: string, name: string) => void; accept?: string; initialFiles?: File[] }) {
  const ref = useRef<HTMLInputElement>(null);
  const load = async (file?: File) => {
    if (!file) return;
    try {
      onText(await readTextFile(file), file.name);
    } catch (err) {
      toast.error('Could not open the file', (err as Error).message);
    }
  };
  useEffect(() => {
    if (initialFiles?.[0]) void load(initialFiles[0]);
    // Only on first mount.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  return (
    <>
      <Button size="sm" icon={<FileUp size={14} />} onClick={() => ref.current?.click()}>
        Open file
      </Button>
      <input
        ref={ref}
        type="file"
        accept={accept}
        className="sr-only"
        tabIndex={-1}
        aria-hidden
        onChange={(e) => {
          void load(e.target.files?.[0]);
          e.target.value = '';
        }}
      />
    </>
  );
}

export function Stat({ label, value, hint }: { label: string; value: string | number; hint?: string }) {
  return (
    <div className="rounded-lg border border-line bg-surface p-3">
      <p className="text-xl font-semibold tabular-nums text-fg">{typeof value === 'number' ? value.toLocaleString() : value}</p>
      <p className="text-xs text-muted">{label}</p>
      {hint && <p className="mt-0.5 text-[11px] text-muted">{hint}</p>}
    </div>
  );
}
