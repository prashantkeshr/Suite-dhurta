import { useMemo, useState } from 'react';
import type { ToolDefinition } from '@/types/tool';
import { Card, Select, Toggle } from '@/components/ui/primitives';
import { TextPanel, CopyButton, DownloadTextButton } from '@/components/tools/common';
import { cleanText, DEFAULT_CLEAN, type CleanOptions } from './logic';
import { OpenTextButton } from './shared';

export default function TextCleanerTool({ initialFiles }: { tool: ToolDefinition; initialFiles?: File[] }) {
  const [text, setText] = useState('');
  const [name, setName] = useState('cleaned.txt');
  const [o, setO] = useState<CleanOptions>({ ...DEFAULT_CLEAN, removeEmpty: true, dedupe: true });
  const set = <K extends keyof CleanOptions>(k: K) => (v: CleanOptions[K]) => setO((prev) => ({ ...prev, [k]: v }));
  const { output, removed } = useMemo(() => cleanText(text, o), [text, o]);
  const inLines = text ? text.split(/\r\n|\r|\n/).length : 0;

  return (
    <div className="grid gap-4 lg:grid-cols-[1fr_280px]">
      <div className="grid min-w-0 gap-4 md:grid-cols-2">
        <TextPanel id="tc-in" label={`Input · ${inLines} lines`} value={text} onChange={setText} rows={16} placeholder="Paste lines of text…" actions={<OpenTextButton onText={(t, n) => (setText(t), setName(n.replace(/(\.[^.]+)?$/, '-cleaned.txt')))} initialFiles={initialFiles} />} />
        <TextPanel
          id="tc-out"
          label={`Result${removed ? ` · ${removed} lines removed` : ''}`}
          value={output}
          readOnly
          rows={16}
          actions={
            <>
              <CopyButton text={output} />
              <DownloadTextButton text={output} filename={name} />
            </>
          }
        />
      </div>
      <Card className="h-fit p-4">
        <p className="label">Operations</p>
        <div className="divide-y divide-line">
          <Toggle checked={o.trimLines} onChange={set('trimLines')} label="Trim each line" />
          <Toggle checked={o.collapseSpaces} onChange={set('collapseSpaces')} label="Collapse repeated spaces" />
          <Toggle checked={o.removeEmpty} onChange={set('removeEmpty')} label="Remove empty lines" />
          <Toggle checked={o.dedupe} onChange={set('dedupe')} label="Remove duplicate lines" />
          {o.dedupe && <Toggle checked={o.dedupeIgnoreCase} onChange={set('dedupeIgnoreCase')} label="…ignoring case" />}
          <Toggle checked={o.removeLineBreaksInParagraphs} onChange={set('removeLineBreaksInParagraphs')} label="Fix broken line wraps" description="Joins lines inside paragraphs (e.g. text copied from PDFs)." />
          <Toggle checked={o.joinLines} onChange={set('joinLines')} label="Join all lines into one" />
          <Toggle checked={o.reverseLines} onChange={set('reverseLines')} label="Reverse line order" />
          <Toggle checked={o.reverseText} onChange={set('reverseText')} label="Reverse characters" />
        </div>
        <div className="mt-3">
          <Select
            label="Sort lines"
            value={o.sort}
            onChange={(e) => set('sort')(e.target.value as CleanOptions['sort'])}
            options={[
              { value: 'none', label: 'Keep original order' },
              { value: 'asc', label: 'A → Z' },
              { value: 'desc', label: 'Z → A' },
              { value: 'natural', label: 'Natural (item2 before item10)' },
              { value: 'length', label: 'By length' },
            ]}
          />
        </div>
      </Card>
    </div>
  );
}
