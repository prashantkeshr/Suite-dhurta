import { useEffect, useMemo, useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { AlertTriangle, FileQuestion, X } from 'lucide-react';
import type { ToolDefinition } from '@/types/tool';
import { detectFile, type DetectedFile } from '@/filesystem/detect';
import { useHandoff } from '@/filesystem/handoff';
import { toolsForFile, acceptsFile } from '@/tools/registry';
import { formatBytes } from '@/utils/format';
import { useObjectUrl } from '@/hooks/useObjectUrl';
import { t } from '@/i18n';
import { Icon } from '@/components/ui/Icon';
import { Button, StatusBadge } from '@/components/ui/primitives';
import { EmptyState } from '@/components/ui/states';

function Thumb({ d }: { d: DetectedFile }) {
  const isImage = d.kind === 'image' && d.mime !== 'image/heic' && d.mime !== 'image/tiff';
  const url = useObjectUrl(isImage ? d.file : null);
  const [dims, setDims] = useState<string>();
  return (
    <div className="flex items-center gap-3">
      <div className="checker flex h-14 w-14 shrink-0 items-center justify-center overflow-hidden rounded-md border border-line">
        {url ? (
          <img src={url} alt="" className="max-h-full max-w-full object-contain" onLoad={(e) => setDims(`${e.currentTarget.naturalWidth} × ${e.currentTarget.naturalHeight}`)} />
        ) : (
          <FileQuestion size={22} className="text-muted" aria-hidden />
        )}
      </div>
      <div className="min-w-0 text-sm">
        <p className="truncate font-medium text-fg" title={d.name}>
          {d.name}
        </p>
        <p className="text-muted">
          {d.label}
          {dims && ` · ${dims}`} · {formatBytes(d.size)}
        </p>
        {d.extensionMismatch && (
          <p className="mt-0.5 flex items-center gap-1 text-xs text-warning">
            <AlertTriangle size={12} aria-hidden /> The file extension does not match its contents.
          </p>
        )}
        {d.empty && <p className="mt-0.5 text-xs text-error">This file is empty (0 bytes).</p>}
      </div>
    </div>
  );
}

/**
 * "What can I do with this file?" — detects the files and suggests tools from
 * the registry. Tools that accept every selected file are listed first.
 */
export function FileActions({ files, onClear }: { files: File[]; onClear: () => void }) {
  const [detected, setDetected] = useState<DetectedFile[] | null>(null);
  const navigate = useNavigate();
  const give = useHandoff((s) => s.give);

  useEffect(() => {
    let alive = true;
    setDetected(null);
    Promise.all(files.map(detectFile)).then((d) => alive && setDetected(d));
    return () => {
      alive = false;
    };
  }, [files]);

  const { forAll, planned } = useMemo(() => {
    if (!detected) return { forAll: [] as ToolDefinition[], planned: [] as ToolDefinition[] };
    const nonEmpty = detected.filter((d) => !d.empty);
    if (nonEmpty.length === 0) return { forAll: [], planned: [] };
    const first = nonEmpty[0];
    const all = toolsForFile(first.mime, first.name, { includePlanned: true }).filter((tool) => nonEmpty.every((d) => acceptsFile(tool, d.mime, d.name)));
    // Batch-incapable tools only make sense for one file.
    const usable = all.filter((x) => x.status !== 'coming-soon' && x.status !== 'unavailable' && (nonEmpty.length === 1 || x.batch));
    return { forAll: usable, planned: all.filter((x) => x.status === 'coming-soon').slice(0, 6) };
  }, [detected]);

  const open = (tool: ToolDefinition) => {
    const accepted = (detected ?? []).filter((d) => !d.empty && acceptsFile(tool, d.mime, d.name)).map((d) => d.file);
    give(accepted);
    navigate(`/tools/${tool.id}`);
  };

  return (
    <section aria-labelledby="fa-title" className="card animate-in p-4 sm:p-5">
      <div className="mb-4 flex items-center justify-between gap-2">
        <h2 id="fa-title" className="text-base font-semibold">
          {t('detect.title')}
        </h2>
        <Button size="sm" variant="ghost" onClick={onClear} icon={<X size={14} />}>
          {t('detect.clear')}
        </Button>
      </div>

      <p className="label">{t('detect.detected')}</p>
      <div className="mb-5 grid gap-3 sm:grid-cols-2">
        {detected ? detected.slice(0, 6).map((d, i) => <Thumb key={i} d={d} />) : <p className="text-sm text-muted">Analyzing files…</p>}
        {detected && detected.length > 6 && <p className="self-center text-sm text-muted">and {detected.length - 6} more</p>}
      </div>

      {detected && (
        <>
          <p className="label">{t('detect.suggested')}</p>
          {forAll.length === 0 ? (
            <EmptyState
              title={t('detect.none')}
              body={files.length > 1 ? 'These files are of different types. Try dropping files of one type at a time.' : 'Browse all tools to see what is available.'}
              action={
                <Link to="/tools">
                  <Button>{t('home.all')}</Button>
                </Link>
              }
            />
          ) : (
            <div className="flex flex-wrap gap-2">
              {forAll.map((tool) => (
                <Button key={tool.id} onClick={() => open(tool)} icon={<Icon name={tool.icon} size={16} />} className="h-auto min-h-[40px] py-1.5">
                  {tool.actionLabel ?? tool.name}
                  {tool.status !== 'available' && <StatusBadge status={tool.status} />}
                </Button>
              ))}
            </div>
          )}
          {planned.length > 0 && (
            <p className="mt-4 text-xs text-muted">
              {t('status.coming-soon')}:{' '}
              {planned.map((p, i) => (
                <span key={p.id}>
                  {i > 0 && ', '}
                  <Link to={`/tools/${p.id}`} className="hover:text-fg hover:underline">
                    {p.actionLabel ?? p.name}
                  </Link>
                </span>
              ))}
            </p>
          )}
        </>
      )}
    </section>
  );
}
