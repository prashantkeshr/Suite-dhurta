import { useMemo, useState } from 'react';
import type { ToolDefinition } from '@/types/tool';
import { Card, Select, Toggle } from '@/components/ui/primitives';
import { TextPanel, CopyButton } from '@/components/tools/common';
import { slugify } from './logic';

export default function SlugTool(_: { tool: ToolDefinition }) {
  const [text, setText] = useState('');
  const [sep, setSep] = useState('-');
  const [lower, setLower] = useState(true);
  const [ascii, setAscii] = useState(false);
  const [max, setMax] = useState('');
  const output = useMemo(
    () =>
      text
        .split('\n')
        .map((l) => (l.trim() ? slugify(l, { separator: sep, lowercase: lower, asciiOnly: ascii, maxLength: Number(max) || undefined }) : ''))
        .join('\n'),
    [text, sep, lower, ascii, max],
  );
  return (
    <div className="grid gap-4 lg:grid-cols-[1fr_260px]">
      <div className="grid min-w-0 gap-4 md:grid-cols-2">
        <TextPanel id="slug-in" label="Titles (one per line)" value={text} onChange={setText} placeholder="10 Tips for Better Photos in 2026&#10;भारत की यात्रा" />
        <TextPanel id="slug-out" label="Slugs" value={output} readOnly actions={<CopyButton text={output} />} />
      </div>
      <Card className="h-fit space-y-3 p-4">
        <Select label="Separator" value={sep} onChange={(e) => setSep(e.target.value)} options={[{ value: '-', label: 'Hyphen (-)' }, { value: '_', label: 'Underscore (_)' }, { value: '.', label: 'Dot (.)' }, { value: '', label: 'None' }]} />
        <Toggle checked={lower} onChange={setLower} label="Lowercase" />
        <Toggle checked={ascii} onChange={setAscii} label="ASCII only" description="Drops non-Latin characters such as Hindi." />
        <div>
          <label htmlFor="slug-max" className="label">
            Max length
          </label>
          <input id="slug-max" className="input" inputMode="numeric" placeholder="No limit" value={max} onChange={(e) => setMax(e.target.value.replace(/\D/g, ''))} />
        </div>
      </Card>
    </div>
  );
}
