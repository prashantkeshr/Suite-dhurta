import { useCallback, useEffect, useState } from 'react';
import { RefreshCw } from 'lucide-react';
import type { ToolDefinition } from '@/types/tool';
import { Button, Card, Segmented, Toggle } from '@/components/ui/primitives';
import { CopyButton, DownloadTextButton, TextPanel } from '@/components/tools/common';
import { uuidV4, randomToken } from './logic';

export default function RandomIdTool({ tool }: { tool: ToolDefinition }) {
  const isUuid = tool.id === 'uuid-generator';
  const [count, setCount] = useState(isUuid ? 5 : 1);
  const [upper, setUpper] = useState(false);
  const [hyphens, setHyphens] = useState(true);
  const [bytes, setBytes] = useState(32);
  const [format, setFormat] = useState<'hex' | 'base64' | 'base64url'>('hex');
  const [output, setOutput] = useState('');

  const generate = useCallback(() => {
    const items = Array.from({ length: count }, () => {
      if (!isUuid) return randomToken(bytes, format);
      let id = uuidV4();
      if (!hyphens) id = id.replace(/-/g, '');
      return upper ? id.toUpperCase() : id;
    });
    setOutput(items.join('\n'));
  }, [count, upper, hyphens, bytes, format, isUuid]);

  useEffect(generate, [generate]);

  return (
    <div className="grid gap-4 lg:grid-cols-[1fr_280px]">
      <TextPanel
        id="ids"
        label={isUuid ? `UUID v4 × ${count}` : `${bytes}-byte token${count > 1 ? 's' : ''}`}
        value={output}
        readOnly
        rows={Math.min(16, Math.max(4, count + 1))}
        actions={
          <>
            <CopyButton text={output} />
            <DownloadTextButton text={output} filename={isUuid ? 'uuids.txt' : 'tokens.txt'} />
          </>
        }
      />
      <Card className="h-fit space-y-3 p-4">
        <div>
          <label htmlFor="id-count" className="label">
            How many (max 1000)
          </label>
          <input id="id-count" type="number" min={1} max={1000} className="input" value={count} onChange={(e) => setCount(Math.min(1000, Math.max(1, Number(e.target.value) || 1)))} />
        </div>
        {isUuid ? (
          <>
            <Toggle checked={upper} onChange={setUpper} label="Uppercase" />
            <Toggle checked={hyphens} onChange={setHyphens} label="Include hyphens" />
          </>
        ) : (
          <>
            <div>
              <label htmlFor="tok-bytes" className="label">
                Random bytes: {bytes} ({bytes * 8} bits)
              </label>
              <input id="tok-bytes" type="range" min={8} max={128} step={8} value={bytes} onChange={(e) => setBytes(Number(e.target.value))} className="w-full accent-[rgb(var(--accent))]" />
            </div>
            <Segmented label="Format" value={format} onChange={setFormat} options={[{ value: 'hex', label: 'Hex' }, { value: 'base64', label: 'Base64' }, { value: 'base64url', label: 'Base64URL' }]} />
          </>
        )}
        <Button variant="primary" icon={<RefreshCw size={15} />} onClick={generate} className="w-full justify-center">
          Generate
        </Button>
        <p className="text-xs text-muted">Uses your browser’s cryptographic random number generator.</p>
      </Card>
    </div>
  );
}
