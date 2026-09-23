import { useMemo, useState } from 'react';
import type { ToolDefinition } from '@/types/tool';
import { Toggle } from '@/components/ui/primitives';
import { TextPanel, CopyButton, DownloadTextButton } from '@/components/tools/common';
import { findReplace, type FindOptions } from './logic';
import { OpenTextButton } from './shared';

export default function FindReplaceTool({ initialFiles }: { tool: ToolDefinition; initialFiles?: File[] }) {
  const [text, setText] = useState('');
  const [find, setFind] = useState('');
  const [replace, setReplace] = useState('');
  const [o, setO] = useState<FindOptions>({ caseSensitive: false, regex: false, wholeWord: false });

  const result = useMemo(() => {
    try {
      return { ...findReplace(text, find, replace, o), error: null as string | null };
    } catch (err) {
      return { output: text, count: 0, error: (err as Error).message };
    }
  }, [text, find, replace, o]);

  return (
    <div className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-2">
        <div>
          <label htmlFor="fr-find" className="label">
            Find
          </label>
          <input id="fr-find" className="input font-mono" value={find} onChange={(e) => setFind(e.target.value)} aria-invalid={!!result.error} />
        </div>
        <div>
          <label htmlFor="fr-rep" className="label">
            Replace with
          </label>
          <input id="fr-rep" className="input font-mono" value={replace} onChange={(e) => setReplace(e.target.value)} placeholder={o.regex ? 'Use $1 or $<name> for groups' : ''} />
        </div>
      </div>
      <div className="flex flex-wrap gap-x-6">
        <Toggle checked={o.caseSensitive} onChange={(v) => setO({ ...o, caseSensitive: v })} label="Match case" />
        <Toggle checked={o.wholeWord} onChange={(v) => setO({ ...o, wholeWord: v })} label="Whole words" />
        <Toggle checked={o.regex} onChange={(v) => setO({ ...o, regex: v })} label="Regular expression" />
      </div>
      <p className={result.error ? 'text-sm text-error' : 'text-sm text-muted'} aria-live="polite">
        {result.error ? `Invalid pattern: ${result.error}` : find ? `${result.count} replacement${result.count === 1 ? '' : 's'}` : 'Enter text to find.'}
      </p>
      <div className="grid gap-4 md:grid-cols-2">
        <TextPanel id="fr-in" label="Text" value={text} onChange={setText} rows={14} actions={<OpenTextButton onText={(t) => setText(t)} initialFiles={initialFiles} />} />
        <TextPanel
          id="fr-out"
          label="Result"
          value={result.output}
          readOnly
          rows={14}
          actions={
            <>
              <CopyButton text={result.output} />
              <DownloadTextButton text={result.output} filename="replaced.txt" />
            </>
          }
        />
      </div>
    </div>
  );
}
