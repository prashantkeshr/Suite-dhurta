import { useCallback, useMemo, useState, type ReactNode } from 'react';
import { Download, FileText, X } from 'lucide-react';
import type { ToolDefinition } from '@/types/tool';
import { acceptAttribute, formatLabel } from '@/tools/registry';
import { useInitialFiles } from '@/hooks/useInitialFiles';
import { formatBytes } from '@/utils/format';
import { t } from '@/i18n';
import { Button, Progress } from '@/components/ui/primitives';
import { ErrorState } from '@/components/ui/states';
import { FileDropzone } from '@/components/files/FileDropzone';
import { useSaver } from '@/components/tools/common';
import { loadPdf, readInfo } from './engine';
import { parsePageRanges } from './ranges';
import { usePdfPreview } from './usePdfPreview';
import { PdfThumbnail } from './PdfThumbnail';

export interface PdfSource {
  file: File;
  pages: { width: number; height: number; rotation: number }[];
}

/** Single-PDF input: validation (not a PDF, empty, encrypted) and page info. */
export function usePdfSource(initialFiles?: File[]) {
  const [source, setSource] = useState<PdfSource | null>(null);
  const [error, setError] = useState<unknown>(null);
  const open = useCallback(async (files: File[]) => {
    setError(null);
    try {
      const { doc, file } = await loadPdf(files[0]);
      setSource({ file, pages: readInfo(doc).pages });
    } catch (err) {
      setSource(null);
      setError(err);
    }
  }, []);
  useInitialFiles(initialFiles, open);
  const { doc: preview } = usePdfPreview(source?.file);
  return { source, error, open, close: () => setSource(null), preview };
}

/** Dropzone (when empty) + load error + file header (when open). */
export function PdfSourceHeader({ tool, src, children }: { tool: ToolDefinition; src: ReturnType<typeof usePdfSource>; children?: ReactNode }) {
  return (
    <>
      {!src.source && <FileDropzone onFiles={src.open} accept={acceptAttribute(tool)} acceptLabel={formatLabel(tool.inputTypes)} multiple={false} />}
      {src.error != null && <ErrorState error={src.error} />}
      {src.source && (
        <div className="flex items-center gap-2">
          <FileText size={18} className="shrink-0 text-muted" aria-hidden />
          <p className="min-w-0 flex-1 truncate text-sm font-medium">
            {src.source.file.name}{' '}
            <span className="font-normal text-muted">
              · {src.source.pages.length} page{src.source.pages.length === 1 ? '' : 's'} · {formatBytes(src.source.file.size)}
            </span>
          </p>
          {children}
          <Button size="sm" variant="ghost" icon={<X size={14} />} onClick={src.close}>
            Change file
          </Button>
        </div>
      )}
    </>
  );
}

/** Page-range field that validates against the page count. Empty means all pages. */
export function PageRangeField({ value, onChange, pageCount, label = 'Pages', id = 'pages' }: { value: string; onChange: (v: string) => void; pageCount: number; label?: string; id?: string }) {
  let error: string | null = null;
  try {
    parsePageRanges(value, pageCount);
  } catch (err) {
    error = (err as Error).message;
  }
  return (
    <div>
      <label htmlFor={id} className="label">
        {label}
      </label>
      <input id={id} className="input font-mono" placeholder={`All pages (e.g. 1-3, 5)`} value={value} onChange={(e) => onChange(e.target.value)} aria-invalid={!!error} aria-describedby={`${id}-help`} />
      <p id={`${id}-help`} className={error ? 'mt-1 text-xs text-error' : 'mt-1 text-xs text-muted'}>
        {error ?? 'Leave empty for all pages.'}
      </p>
    </div>
  );
}

export function rangeOrAll(value: string, count: number): number[] | null {
  try {
    return parsePageRanges(value, count);
  } catch {
    return null;
  }
}

/** Progress while running, then a result with download and a preview of the real output. */
export function PdfResult({
  running,
  progress,
  step,
  onCancel,
  result,
  filename,
  previewPage = 0,
}: {
  running: boolean;
  progress: number | null;
  step?: string;
  onCancel: () => void;
  result: Blob | null;
  filename: string;
  previewPage?: number;
}) {
  const save = useSaver();
  // Stable identity, so the preview isn't reopened on every render.
  const resultFile = useMemo(() => (result ? new File([result], filename, { type: 'application/pdf' }) : null), [result, filename]);
  if (running) {
    return (
      <div className="space-y-2">
        <Progress value={progress} label="Processing PDF" />
        <p className="text-xs text-muted">{step ?? t('queue.processing')}</p>
        <Button onClick={onCancel} className="w-full justify-center">
          {t('action.cancel')}
        </Button>
      </div>
    );
  }
  if (!resultFile) return null;
  return (
    <div className="space-y-2 rounded-md border border-success/30 bg-success/5 p-3 text-sm">
      <p className="font-medium">Ready · {formatBytes(resultFile.size)}</p>
      <ResultPreview file={resultFile} page={previewPage} />
      <Button variant="primary" className="w-full justify-center" icon={<Download size={16} />} onClick={() => save(resultFile, filename)}>
        {t('action.download')}
      </Button>
      <p className="text-xs text-muted">Your original file is unchanged.</p>
    </div>
  );
}

function ResultPreview({ file, page }: { file: File; page: number }) {
  const { doc } = usePdfPreview(file);
  if (!doc) return null;
  return (
    <div className="rounded border border-line bg-surface2 p-2">
      <p className="mb-1 text-[11px] font-medium uppercase tracking-wide text-muted">Result preview · page {page + 1}</p>
      <PdfThumbnail key={file.size + ':' + page} doc={doc} index={Math.min(page, doc.numPages - 1)} size={420} />
    </div>
  );
}

