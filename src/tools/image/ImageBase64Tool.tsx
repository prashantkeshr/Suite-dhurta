import { useCallback, useMemo, useState } from 'react';
import { Download } from 'lucide-react';
import type { ToolDefinition } from '@/types/tool';
import { acceptAttribute, formatLabel } from '@/tools/registry';
import { detectFile, detectFromBytes } from '@/filesystem/detect';
import { useObjectUrl } from '@/hooks/useObjectUrl';
import { useStore } from '@/storage/store';
import { formatBytes } from '@/utils/format';
import { extensionForMime } from '@/utils/filename';
import { LIMITS } from '@/app/config';
import { Button, Card, Segmented } from '@/components/ui/primitives';
import { FileDropzone } from '@/components/files/FileDropzone';
import { CopyButton, TextPanel, useSaver } from '@/components/tools/common';
import { ErrorState } from '@/components/ui/states';
import { UserError } from '@/utils/errors';
import { useInitialFiles } from '@/hooks/useInitialFiles';

function readAsDataUrl(file: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result));
    r.onerror = () => reject(r.error);
    r.readAsDataURL(file);
  });
}

function Encode({ tool, initialFiles }: { tool: ToolDefinition; initialFiles?: File[] }) {
  const [file, setFile] = useState<File | null>(null);
  const [dataUrl, setDataUrl] = useState('');
  const [format, setFormat] = useState<'datauri' | 'raw' | 'css' | 'html'>('datauri');
  const addHistory = useStore((s) => s.addHistory);
  const url = useObjectUrl(file);

  const load = useCallback(
    async (files: File[]) => {
      const f = files[0];
      const d = await detectFile(f);
      // Use the detected MIME so the data URI is correct even with a wrong extension.
      const du = await readAsDataUrl(new Blob([f], { type: d.mime }));
      setFile(f);
      setDataUrl(du);
      addHistory(tool.id, `${d.label} → Base64`);
    },
    [addHistory, tool.id],
  );

  useInitialFiles(initialFiles, load);

  const output = useMemo(() => {
    if (!dataUrl) return '';
    const raw = dataUrl.slice(dataUrl.indexOf(',') + 1);
    if (format === 'raw') return raw;
    if (format === 'css') return `background-image: url("${dataUrl}");`;
    if (format === 'html') return `<img src="${dataUrl}" alt="" />`;
    return dataUrl;
  }, [dataUrl, format]);

  return (
    <div className="space-y-4">
      <FileDropzone onFiles={load} accept={acceptAttribute(tool)} acceptLabel={formatLabel(tool.inputTypes)} multiple={false} compact={!!file} warnBytes={5 * 1024 * 1024} />
      {file && (
        <Card className="space-y-4 p-4">
          <div className="flex items-center gap-3">
            <div className="checker flex h-16 w-16 items-center justify-center overflow-hidden rounded border border-line">{url && <img src={url} alt="" className="max-h-full max-w-full" />}</div>
            <div className="text-sm">
              <p className="font-medium">{file.name}</p>
              <p className="text-muted">
                {formatBytes(file.size)} → {formatBytes(output.length)} as text
              </p>
            </div>
          </div>
          <Segmented label="Output" value={format} onChange={setFormat} options={[{ value: 'datauri', label: 'Data URI' }, { value: 'raw', label: 'Base64 only' }, { value: 'css', label: 'CSS' }, { value: 'html', label: 'HTML <img>' }]} />
          <TextPanel label="Base64" value={output.length > 2_000_000 ? output.slice(0, 2_000_000) + '\n… (truncated in preview — use Copy)' : output} readOnly rows={8} actions={<CopyButton text={output} />} />
        </Card>
      )}
    </div>
  );
}

function Decode() {
  const [input, setInput] = useState('');
  const save = useSaver();
  const result = useMemo(() => {
    const trimmed = input.trim();
    if (!trimmed) return null;
    try {
      const m = trimmed.match(/^data:([^;,]+)?(;base64)?,(.*)$/s);
      const b64 = (m ? m[3] : trimmed).replace(/\s+/g, '').replace(/-/g, '+').replace(/_/g, '/');
      if (m && !m[2]) throw new UserError('This data URI is not Base64-encoded.', ['Only ;base64 data URIs are supported']);
      if (b64.length * 0.75 > LIMITS.warnBytes) throw new UserError('This Base64 text is too large to decode here.');
      const bin = atob(b64.padEnd(Math.ceil(b64.length / 4) * 4, '='));
      const bytes = new Uint8Array(bin.length);
      for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
      const d = detectFromBytes(bytes.subarray(0, 4096), 'image');
      if (!d.mime.startsWith('image/'))
        throw new UserError('The decoded data is not a recognised image.', [`It looks like: ${d.label}`], ['Check that you copied the full Base64 string']);
      return { blob: new Blob([bytes], { type: d.mime }), mime: d.mime, label: d.label, error: undefined };
    } catch (err) {
      if (err instanceof UserError) return { error: err, blob: undefined };
      return { blob: undefined, error: new UserError('This is not valid Base64.', ['It contains characters outside the Base64 alphabet', 'It may be truncated'], ['Paste the complete string, including any trailing = characters'], err) };
    }
  }, [input]);
  const url = useObjectUrl(result?.blob);

  return (
    <div className="space-y-4">
      <TextPanel label="Base64 or data URI" value={input} onChange={setInput} placeholder="data:image/png;base64,iVBORw0KGgo…" rows={8} />
      {result?.error && <ErrorState error={result.error} />}
      {result?.blob && (
        <Card className="flex flex-col gap-4 p-4 sm:flex-row sm:items-center">
          <div className="checker flex h-40 w-full items-center justify-center overflow-hidden rounded border border-line sm:w-40">{url && <img src={url} alt="Decoded image" className="max-h-full max-w-full" />}</div>
          <div className="space-y-2 text-sm">
            <p>
              <span className="font-medium">{result.label}</span> · {formatBytes(result.blob.size)}
            </p>
            <Button variant="primary" icon={<Download size={16} />} onClick={() => save(result.blob, `decoded-image.${extensionForMime(result.mime)}`)}>
              Download image
            </Button>
          </div>
        </Card>
      )}
    </div>
  );
}

export default function ImageBase64Tool({ tool, initialFiles }: { tool: ToolDefinition; initialFiles?: File[] }) {
  return tool.id === 'base64-to-image' ? <Decode /> : <Encode tool={tool} initialFiles={initialFiles} />;
}
