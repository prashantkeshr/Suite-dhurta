import { useCallback, useState } from 'react';
import { Download, FileImage } from 'lucide-react';
import type { ToolDefinition } from '@/types/tool';
import { acceptAttribute, formatLabel } from '@/tools/registry';
import { detectFile } from '@/filesystem/detect';
import { useObjectUrl } from '@/hooks/useObjectUrl';
import { useStore } from '@/storage/store';
import { formatBytes } from '@/utils/format';
import { t } from '@/i18n';
import { Button, Card, Progress, Segmented, Select } from '@/components/ui/primitives';
import { ErrorState } from '@/components/ui/states';
import { toast } from '@/components/ui/Toast';
import { FileDropzone } from '@/components/files/FileDropzone';
import { SortableFileList } from '@/components/files/SortableFileList';
import { useSaver } from '@/components/tools/common';
import { imagesToPdf, type PageSizeKey } from './engine';
import { useJob } from './useJob';
import { useInitialFiles } from '@/hooks/useInitialFiles';

interface Item {
  file: File;
  mime: string;
}

function Thumb({ file }: { file: File }) {
  const url = useObjectUrl(file);
  return <div className="checker flex h-10 w-10 shrink-0 items-center justify-center overflow-hidden rounded border border-line">{url && <img src={url} alt="" className="max-h-full max-w-full object-contain" />}</div>;
}

const ACCEPTED = new Set(['image/jpeg', 'image/png', 'image/webp']);

export default function ImageToPdfTool({ tool, initialFiles }: { tool: ToolDefinition; initialFiles?: File[] }) {
  const [items, setItems] = useState<Item[]>([]);
  const [size, setSize] = useState<PageSizeKey>('a4');
  const [orientation, setOrientation] = useState<'auto' | 'portrait' | 'landscape'>('auto');
  const [margin, setMargin] = useState('20');
  const [name, setName] = useState('images');
  const job = useJob<Blob>();
  const save = useSaver();
  const addHistory = useStore((s) => s.addHistory);

  const add = useCallback(async (files: File[]) => {
    const detected = await Promise.all(files.map(detectFile));
    const ok = detected.filter((d) => ACCEPTED.has(d.mime) && !d.empty);
    const skipped = detected.length - ok.length;
    if (skipped) toast.warning(`${skipped} file${skipped > 1 ? 's were' : ' was'} skipped`, 'Only JPEG, PNG and WebP images can be added.');
    setItems((prev) => [...prev, ...ok.map((d) => ({ file: d.file, mime: d.mime }))]);
  }, []);

  useInitialFiles(initialFiles, add);

  const create = async () => {
    const r = await job.run((signal, report) => imagesToPdf(items, { size, margin: Math.max(0, Number(margin) || 0), orientation }, signal, (v, s) => report(v, s)));
    if (r) addHistory(tool.id, `${items.length} image${items.length > 1 ? 's' : ''} → PDF`);
  };

  return (
    <div className="space-y-4">
      <FileDropzone onFiles={add} accept={acceptAttribute(tool)} acceptLabel={formatLabel(tool.inputTypes)} compact={items.length > 0} />
      {items.length > 0 && (
        <div className="grid gap-4 lg:grid-cols-[1fr_300px]">
          <Card className="overflow-hidden">
            <div className="border-b border-line px-4 py-2.5 text-sm font-medium">
              {items.length} image{items.length > 1 ? 's' : ''} · one per page, in this order
            </div>
            <SortableFileList
              items={items}
              onChange={(next) => (setItems(next), job.reset())}
              label={(i) => i.file.name}
              render={(i) => (
                <div className="flex items-center gap-3">
                  <Thumb file={i.file} />
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium">{i.file.name}</p>
                    <p className="text-xs text-muted">{formatBytes(i.file.size)}</p>
                  </div>
                </div>
              )}
            />
          </Card>
          <Card className="h-fit space-y-4 p-4 lg:sticky lg:top-20">
            <Select
              label="Page size"
              value={size}
              onChange={(e) => setSize(e.target.value as PageSizeKey)}
              options={[
                { value: 'a4', label: 'A4 (210 × 297 mm)' },
                { value: 'letter', label: 'US Letter' },
                { value: 'legal', label: 'US Legal' },
                { value: 'fit', label: 'Fit to image' },
              ]}
            />
            {size !== 'fit' && (
              <Segmented
                label="Orientation"
                value={orientation}
                onChange={setOrientation}
                options={[
                  { value: 'auto', label: 'Auto' },
                  { value: 'portrait', label: 'Portrait' },
                  { value: 'landscape', label: 'Landscape' },
                ]}
              />
            )}
            <div>
              <label htmlFor="margin" className="label">
                Margin (points, 72 = 1 inch)
              </label>
              <input id="margin" className="input" inputMode="numeric" value={margin} onChange={(e) => setMargin(e.target.value.replace(/\D/g, ''))} />
            </div>
            <div>
              <label htmlFor="pdfname" className="label">
                File name
              </label>
              <div className="flex items-center gap-1">
                <input id="pdfname" className="input" value={name} onChange={(e) => setName(e.target.value)} />
                <span className="text-sm text-muted">.pdf</span>
              </div>
            </div>
            {job.running ? (
              <div className="space-y-2">
                <Progress value={job.progress} label="Creating PDF" />
                <p className="text-xs text-muted">{job.step ?? t('queue.processing')}</p>
                <Button onClick={job.cancel} className="w-full justify-center">
                  {t('action.cancel')}
                </Button>
              </div>
            ) : (
              <Button variant="primary" size="lg" className="w-full justify-center" onClick={create} icon={<FileImage size={16} />}>
                Create PDF
              </Button>
            )}
            {job.result && (
              <Button className="w-full justify-center" icon={<Download size={16} />} onClick={() => save(job.result!, `${name.trim() || 'images'}.pdf`)}>
                Download ({formatBytes(job.result.size)})
              </Button>
            )}
          </Card>
        </div>
      )}
      {job.error != null && <ErrorState error={job.error} onRetry={create} />}
    </div>
  );
}
