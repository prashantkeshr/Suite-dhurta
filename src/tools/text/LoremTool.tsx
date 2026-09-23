import { useMemo, useState } from 'react';
import { RefreshCw } from 'lucide-react';
import type { ToolDefinition } from '@/types/tool';
import { Button, Card, Segmented, Toggle } from '@/components/ui/primitives';
import { TextPanel, CopyButton, DownloadTextButton } from '@/components/tools/common';
import { lorem } from './logic';

export default function LoremTool(_: { tool: ToolDefinition }) {
  const [count, setCount] = useState(3);
  const [unit, setUnit] = useState<'paragraphs' | 'sentences' | 'words'>('paragraphs');
  const [classic, setClassic] = useState(true);
  const [seed, setSeed] = useState(42);
  const [html, setHtml] = useState(false);
  const output = useMemo(() => {
    const text = lorem(count, unit, { startWithLorem: classic, seed });
    if (!html) return text;
    return unit === 'paragraphs' ? text.split('\n\n').map((p) => `<p>${p}</p>`).join('\n') : `<p>${text}</p>`;
  }, [count, unit, classic, seed, html]);
  const max = unit === 'words' ? 5000 : 200;
  return (
    <div className="grid gap-4 lg:grid-cols-[1fr_260px]">
      <TextPanel
        id="lorem-out"
        label="Generated text"
        value={output}
        readOnly
        rows={16}
        actions={
          <>
            <CopyButton text={output} />
            <DownloadTextButton text={output} filename={html ? 'lorem.html' : 'lorem.txt'} />
          </>
        }
      />
      <Card className="h-fit space-y-3 p-4">
        <Segmented label="Generate" value={unit} onChange={setUnit} options={[{ value: 'paragraphs', label: 'Paragraphs' }, { value: 'sentences', label: 'Sentences' }, { value: 'words', label: 'Words' }]} />
        <div>
          <label htmlFor="lorem-n" className="label">
            How many (max {max})
          </label>
          <input id="lorem-n" type="number" min={1} max={max} className="input" value={count} onChange={(e) => setCount(Math.min(max, Math.max(1, Number(e.target.value) || 1)))} />
        </div>
        <Toggle checked={classic} onChange={setClassic} label="Start with “Lorem ipsum…”" />
        <Toggle checked={html} onChange={setHtml} label="Wrap in <p> tags" />
        <Button icon={<RefreshCw size={14} />} onClick={() => setSeed(Math.floor(Math.random() * 1e9))}>
          Regenerate
        </Button>
      </Card>
    </div>
  );
}
