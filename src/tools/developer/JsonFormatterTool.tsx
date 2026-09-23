import { useMemo, useState } from 'react';
import { CheckCircle2, XCircle } from 'lucide-react';
import type { ToolDefinition } from '@/types/tool';
import { Card, Segmented, Toggle } from '@/components/ui/primitives';
import { TextPanel, CopyButton, DownloadTextButton } from '@/components/tools/common';
import { OpenTextButton } from '@/tools/text/shared';
import { formatJson, jsonStats } from './logic';

type Indent = '2' | '4' | 'tab' | 'min';

export default function JsonFormatterTool({ initialFiles }: { tool: ToolDefinition; initialFiles?: File[] }) {
  const [text, setText] = useState('');
  const [indent, setIndent] = useState<Indent>('2');
  const [sortKeys, setSortKeys] = useState(false);
  const [name, setName] = useState('formatted.json');

  const result = useMemo(() => formatJson(text, indent === 'min' ? 0 : indent === 'tab' ? '\t' : Number(indent), sortKeys), [text, indent, sortKeys]);
  const stats = useMemo(() => {
    if (!result.output) return null;
    try {
      return jsonStats(JSON.parse(result.output));
    } catch {
      return null;
    }
  }, [result.output]);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end gap-4">
        <Segmented
          label="Output"
          value={indent}
          onChange={setIndent}
          options={[
            { value: '2', label: '2 spaces' },
            { value: '4', label: '4 spaces' },
            { value: 'tab', label: 'Tabs' },
            { value: 'min', label: 'Minify' },
          ]}
        />
        <Toggle checked={sortKeys} onChange={setSortKeys} label="Sort keys A–Z" />
      </div>

      {text.trim() && (
        <div aria-live="polite">
          {result.error ? (
            <Card className="flex items-start gap-2 border-error/30 bg-error/5 p-3 text-sm">
              <XCircle size={18} className="mt-0.5 shrink-0 text-error" aria-hidden />
              <div>
                <p className="font-medium">Invalid JSON{result.error.line ? ` at line ${result.error.line}, column ${result.error.column}` : ''}</p>
                <p className="font-mono text-xs text-muted">{result.error.message}</p>
                {result.error.line && (
                  <pre className="mt-2 overflow-x-auto rounded bg-surface2 p-2 font-mono text-xs">
                    {text.split('\n')[result.error.line - 1]}
                    {'\n'}
                    {' '.repeat(Math.max(0, (result.error.column ?? 1) - 1))}^
                  </pre>
                )}
              </div>
            </Card>
          ) : (
            <p className="flex items-center gap-1.5 text-sm text-success">
              <CheckCircle2 size={16} aria-hidden /> Valid JSON
              {stats && <span className="text-muted">· {stats.keys} keys · {stats.objects} objects · {stats.arrays} arrays · depth {stats.depth}</span>}
            </p>
          )}
        </div>
      )}

      <div className="grid gap-4 md:grid-cols-2">
        <TextPanel id="json-in" label="Input" value={text} onChange={setText} rows={18} invalid={!!result.error} placeholder='{"name": "Dhurta", "tools": [1, 2, 3]}' actions={<OpenTextButton accept=".json,application/json,text/plain" onText={(t, n) => (setText(t), setName(n.replace(/(\.[^.]+)?$/, '-formatted.json')))} initialFiles={initialFiles} />} />
        <TextPanel
          id="json-out"
          label="Result"
          value={result.output}
          readOnly
          rows={18}
          actions={
            <>
              <CopyButton text={result.output} />
              <DownloadTextButton text={result.output} filename={name} mime="application/json" />
            </>
          }
        />
      </div>
    </div>
  );
}
