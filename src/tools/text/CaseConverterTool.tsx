import { useMemo, useState } from 'react';
import { clsx } from 'clsx';
import type { ToolDefinition } from '@/types/tool';
import { TextPanel, CopyButton, DownloadTextButton } from '@/components/tools/common';
import { convertCase, type CaseMode } from './logic';

const MODES: { id: CaseMode; label: string; example: string }[] = [
  { id: 'upper', label: 'UPPER CASE', example: 'HELLO WORLD' },
  { id: 'lower', label: 'lower case', example: 'hello world' },
  { id: 'title', label: 'Title Case', example: 'Hello World' },
  { id: 'sentence', label: 'Sentence case', example: 'Hello world' },
  { id: 'camel', label: 'camelCase', example: 'helloWorld' },
  { id: 'pascal', label: 'PascalCase', example: 'HelloWorld' },
  { id: 'snake', label: 'snake_case', example: 'hello_world' },
  { id: 'kebab', label: 'kebab-case', example: 'hello-world' },
  { id: 'constant', label: 'CONSTANT_CASE', example: 'HELLO_WORLD' },
  { id: 'dot', label: 'dot.case', example: 'hello.world' },
  { id: 'inverse', label: 'iNVERSE', example: 'hELLO wORLD' },
  { id: 'alternating', label: 'aLtErNaTiNg', example: 'hElLo WoRlD' },
];

export default function CaseConverterTool(_: { tool: ToolDefinition }) {
  const [text, setText] = useState('');
  const [mode, setMode] = useState<CaseMode>('title');
  const output = useMemo(() => convertCase(text, mode), [text, mode]);
  return (
    <div className="space-y-4">
      <div role="radiogroup" aria-label="Case style" className="flex flex-wrap gap-1.5">
        {MODES.map((m) => (
          <button
            key={m.id}
            role="radio"
            aria-checked={mode === m.id}
            title={m.example}
            onClick={() => setMode(m.id)}
            className={clsx('min-h-[36px] rounded-md border px-3 font-mono text-[13px] transition-colors', mode === m.id ? 'border-accent bg-accent/10 text-accent' : 'border-line bg-surface hover:border-accent/50')}
          >
            {m.label}
          </button>
        ))}
      </div>
      <div className="grid gap-4 md:grid-cols-2">
        <TextPanel id="case-in" label="Input" value={text} onChange={setText} placeholder="Type or paste text…" />
        <TextPanel id="case-out" label="Result" value={output} readOnly actions={<><CopyButton text={output} /><DownloadTextButton text={output} filename="converted.txt" /></>} />
      </div>
    </div>
  );
}
