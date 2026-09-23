import { useMemo, useState } from 'react';
import type { ToolDefinition } from '@/types/tool';
import { Card, Select, Toggle } from '@/components/ui/primitives';
import { TextPanel, CopyButton, DownloadTextButton } from '@/components/tools/common';
import { OpenTextButton } from '@/tools/text/shared';
import { locateJsonError } from '@/tools/developer/logic';
import { csvToJson, jsonToCsv, type Delimiter } from './csv';

const DELIMS = [
  { value: 'auto', label: 'Detect automatically' },
  { value: ',', label: 'Comma (,)' },
  { value: ';', label: 'Semicolon (;)' },
  { value: '\t', label: 'Tab' },
  { value: '|', label: 'Pipe (|)' },
];
const DELIM_NAME: Record<string, string> = { ',': 'comma', ';': 'semicolon', '\t': 'tab', '|': 'pipe' };

function Preview({ rows }: { rows: Record<string, unknown>[] }) {
  if (!rows.length) return null;
  const cols = Object.keys(rows[0]).slice(0, 12);
  return (
    <Card className="overflow-x-auto">
      <table className="w-full text-left text-[13px]">
        <thead className="border-b border-line bg-surface2 text-xs text-muted">
          <tr>
            {cols.map((c) => (
              <th key={c} className="whitespace-nowrap px-3 py-2 font-medium">
                {c}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-line">
          {rows.slice(0, 10).map((r, i) => (
            <tr key={i}>
              {cols.map((c) => (
                <td key={c} className="max-w-[240px] truncate whitespace-nowrap px-3 py-1.5">
                  {typeof r[c] === 'object' ? JSON.stringify(r[c]) : String(r[c] ?? '')}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
      {rows.length > 10 && <p className="border-t border-line px-3 py-2 text-xs text-muted">Showing 10 of {rows.length} rows</p>}
    </Card>
  );
}

export default function CsvJsonTool({ tool, initialFiles }: { tool: ToolDefinition; initialFiles?: File[] }) {
  const toJson = tool.id === 'csv-to-json';
  const [input, setInput] = useState('');
  const [name, setName] = useState(toJson ? 'data' : 'data');
  const [delim, setDelim] = useState('auto');
  const [header, setHeader] = useState(true);
  const [infer, setInfer] = useState(true);
  const [pretty, setPretty] = useState(true);
  const [bom, setBom] = useState(true);

  const result = useMemo(() => {
    if (!input.trim()) return null;
    try {
      if (toJson) {
        const r = csvToJson(input, { delimiter: delim === 'auto' ? undefined : (delim as Delimiter), header, inferTypes: infer, skipEmpty: true });
        return { output: JSON.stringify(r.data, null, pretty ? 2 : 0), info: `${r.data.length} rows · ${r.columns} columns · ${DELIM_NAME[r.delimiter]}-separated`, warnings: r.warnings, rows: header ? (r.data as Record<string, unknown>[]) : [] };
      }
      let parsed: unknown;
      try {
        parsed = JSON.parse(input);
      } catch (err) {
        const loc = locateJsonError(input, err);
        throw new Error(`Invalid JSON${loc.line ? ` at line ${loc.line}, column ${loc.column}` : ''}: ${loc.message}`);
      }
      const r = jsonToCsv(parsed, delim === 'auto' ? ',' : (delim as Delimiter));
      return { output: r.csv, info: `${r.rows} rows · ${r.columns.length} columns`, warnings: [] as string[], rows: [] };
    } catch (err) {
      return { error: (err as Error).message };
    }
  }, [input, toJson, delim, header, infer, pretty]);

  const output = result && 'output' in result ? result.output ?? '' : '';
  const outName = `${name}.${toJson ? 'json' : 'csv'}`;
  // A UTF-8 BOM makes Excel open Hindi/Unicode CSV correctly.
  const download = toJson ? output : (bom ? '﻿' : '') + output;

  return (
    <div className="space-y-4">
      <div className="grid gap-4 lg:grid-cols-[1fr_260px]">
        <div className="grid min-w-0 gap-4 md:grid-cols-2">
          <TextPanel
            id="cj-in"
            label={toJson ? 'CSV / TSV' : 'JSON'}
            value={input}
            onChange={setInput}
            rows={16}
            invalid={!!(result && 'error' in result)}
            placeholder={toJson ? 'name,city,age\nAsha,Pune,31\nRavi,"Delhi, NCR",28' : '[{"name":"Asha","city":"Pune"}]'}
            actions={<OpenTextButton accept={toJson ? '.csv,.tsv,.txt,text/csv' : '.json,application/json'} onText={(t, n) => (setInput(t), setName(n.replace(/\.[^.]+$/, '')))} initialFiles={initialFiles} />}
          />
          <TextPanel
            id="cj-out"
            label={toJson ? 'JSON' : 'CSV'}
            value={output}
            readOnly
            rows={16}
            actions={
              <>
                <CopyButton text={output} />
                <DownloadTextButton text={download} filename={outName} mime={toJson ? 'application/json' : 'text/csv'} />
              </>
            }
          />
        </div>
        <Card className="h-fit space-y-3 p-4">
          <Select label="Delimiter" value={delim} onChange={(e) => setDelim(e.target.value)} options={toJson ? DELIMS : DELIMS.filter((d) => d.value !== 'auto').map((d) => d)} />
          {toJson ? (
            <>
              <Toggle checked={header} onChange={setHeader} label="First row is a header" />
              <Toggle checked={infer} onChange={setInfer} label="Detect numbers & booleans" description="Leading-zero values like 007 stay text." />
              <Toggle checked={pretty} onChange={setPretty} label="Pretty-print" />
            </>
          ) : (
            <Toggle checked={bom} onChange={setBom} label="Excel-friendly (UTF-8 BOM)" description="Helps Excel show Hindi and other Unicode text correctly." />
          )}
        </Card>
      </div>
      <div aria-live="polite">
        {result && 'error' in result && <p className="text-sm text-error">{result.error}</p>}
        {result && 'info' in result && (
          <p className="text-sm text-muted">
            {result.info}
            {result.warnings?.map((w) => (
              <span key={w} className="block text-warning">
                {w}
              </span>
            ))}
          </p>
        )}
      </div>
      {result && 'rows' in result && result.rows && result.rows.length > 0 && <Preview rows={result.rows} />}
    </div>
  );
}
