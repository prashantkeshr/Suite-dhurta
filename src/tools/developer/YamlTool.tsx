import { useEffect, useMemo, useState } from 'react';
import { CheckCircle2, XCircle } from 'lucide-react';
import type { ToolDefinition } from '@/types/tool';
import { Segmented } from '@/components/ui/primitives';
import { TextPanel, CopyButton, DownloadTextButton } from '@/components/tools/common';
import { OpenTextButton } from '@/tools/text/shared';
import { locateJsonError } from './logic';

type Mode = 'format' | 'yaml-to-json' | 'json-to-yaml';
type YamlLib = typeof import('yaml');

interface Result {
  output: string;
  error?: { message: string; line?: number; column?: number };
  docs?: number;
}

function run(Y: YamlLib, input: string, mode: Mode, indent: number): Result {
  if (!input.trim()) return { output: '' };
  if (mode === 'json-to-yaml') {
    let value: unknown;
    try {
      value = JSON.parse(input);
    } catch (err) {
      const loc = locateJsonError(input, err);
      return { output: '', error: { message: 'Invalid JSON', line: loc.line, column: loc.column } };
    }
    return { output: Y.stringify(value, { indent, lineWidth: 0 }) };
  }
  const docs = Y.parseAllDocuments(input);
  const list = Array.isArray(docs) ? docs : [docs];
  for (const d of list) {
    const e = d.errors[0];
    // The library appends "at line X, column Y:"; we show the position separately.
    if (e) return { output: '', error: { message: e.message.split('\n')[0].replace(/\s*at line \d+, column \d+:?\s*$/, ''), line: e.linePos?.[0]?.line, column: e.linePos?.[0]?.col } };
  }
  if (mode === 'yaml-to-json') {
    const values = list.map((d) => d.toJS({ maxAliasCount: 100 }));
    return { output: JSON.stringify(values.length === 1 ? values[0] : values, null, indent), docs: list.length };
  }
  return { output: list.map((d) => Y.stringify(d.toJS({ maxAliasCount: 100 }), { indent, lineWidth: 0 })).join('---\n'), docs: list.length };
}

export default function YamlTool({ initialFiles }: { tool: ToolDefinition; initialFiles?: File[] }) {
  const [input, setInput] = useState('');
  const [mode, setMode] = useState<Mode>('format');
  const [indent, setIndent] = useState<'2' | '4'>('2');
  const [Y, setY] = useState<YamlLib | null>(null);

  useEffect(() => {
    import('yaml').then(setY);
  }, []);

  const result = useMemo<Result>(() => {
    if (!Y) return { output: '' };
    try {
      return run(Y, input, mode, Number(indent));
    } catch (err) {
      return { output: '', error: { message: (err as Error).message } };
    }
  }, [Y, input, mode, indent]);

  const outExt = mode === 'yaml-to-json' ? 'json' : 'yaml';

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end gap-4">
        <Segmented label="Mode" value={mode} onChange={setMode} options={[{ value: 'format', label: 'Format YAML' }, { value: 'yaml-to-json', label: 'YAML → JSON' }, { value: 'json-to-yaml', label: 'JSON → YAML' }]} />
        <Segmented label="Indent" value={indent} onChange={setIndent} options={[{ value: '2', label: '2 spaces' }, { value: '4', label: '4 spaces' }]} />
      </div>
      {input.trim() && (
        <p aria-live="polite" className={`flex items-center gap-1.5 text-sm ${result.error ? 'text-error' : 'text-success'}`}>
          {result.error ? <XCircle size={16} aria-hidden /> : <CheckCircle2 size={16} aria-hidden />}
          {result.error ? `${result.error.message}${result.error.line ? ` (line ${result.error.line}, column ${result.error.column})` : ''}` : `Valid${result.docs && result.docs > 1 ? ` · ${result.docs} documents` : ''}`}
        </p>
      )}
      <div className="grid gap-4 md:grid-cols-2">
        <TextPanel id="yaml-in" label={mode === 'json-to-yaml' ? 'JSON' : 'YAML'} value={input} onChange={setInput} rows={18} invalid={!!result.error} placeholder={mode === 'json-to-yaml' ? '{"name": "Dhurta"}' : 'name: Dhurta\ntools:\n  - yaml\n  - json'} actions={<OpenTextButton accept=".yaml,.yml,.json,text/plain" onText={(t) => setInput(t)} initialFiles={initialFiles} />} />
        <TextPanel
          id="yaml-out"
          label={mode === 'yaml-to-json' ? 'JSON' : 'YAML'}
          value={result.output}
          readOnly
          rows={18}
          actions={
            <>
              <CopyButton text={result.output} />
              <DownloadTextButton text={result.output} filename={`converted.${outExt}`} mime={outExt === 'json' ? 'application/json' : 'application/yaml'} />
            </>
          }
        />
      </div>
      <p className="text-xs text-muted">Comments are not kept when converting or re-formatting. Anchors and aliases are expanded (limited to 100 to guard against “billion laughs” files).</p>
    </div>
  );
}
