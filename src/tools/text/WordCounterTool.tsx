import { useDeferredValue, useMemo, useState } from 'react';
import type { ToolDefinition } from '@/types/tool';
import { formatBytes } from '@/utils/format';
import { Button, Card } from '@/components/ui/primitives';
import { TextPanel } from '@/components/tools/common';
import { countText, formatDuration, topWords } from './logic';
import { OpenTextButton, Stat } from './shared';

export default function WordCounterTool({ initialFiles }: { tool: ToolDefinition; initialFiles?: File[] }) {
  const [text, setText] = useState('');
  // Keep typing responsive on very long documents.
  const deferred = useDeferredValue(text);
  const stats = useMemo(() => countText(deferred), [deferred]);
  const top = useMemo(() => topWords(deferred, 8), [deferred]);

  return (
    <div className="grid gap-4 lg:grid-cols-[1fr_320px]">
      <TextPanel
        id="wc-input"
        label="Your text"
        value={text}
        onChange={setText}
        rows={16}
        placeholder="Type or paste text here. हिंदी और अन्य भाषाएँ भी गिनी जाती हैं।"
        actions={
          <>
            <OpenTextButton onText={(t) => setText(t)} initialFiles={initialFiles} />
            <Button size="sm" variant="ghost" onClick={() => setText('')} disabled={!text}>
              Clear
            </Button>
          </>
        }
      />
      <div className="space-y-3" aria-live="polite">
        <div className="grid grid-cols-2 gap-2">
          <Stat label="Words" value={stats.words} />
          <Stat label="Characters" value={stats.characters} />
          <Stat label="Without spaces" value={stats.charactersNoSpaces} />
          <Stat label="Sentences" value={stats.sentences} />
          <Stat label="Paragraphs" value={stats.paragraphs} />
          <Stat label="Lines" value={stats.lines} />
          <Stat label="Reading time" value={formatDuration(stats.readingMinutes)} hint="at 225 words/min" />
          <Stat label="Speaking time" value={formatDuration(stats.speakingMinutes)} hint="at 140 words/min" />
        </div>
        <p className="text-xs text-muted">Size as UTF-8: {formatBytes(stats.bytes)}. Characters are counted as users see them, so Hindi conjuncts and emoji count once.</p>
        {top.length > 0 && (
          <Card className="p-3">
            <p className="label">Most frequent words</p>
            <ul className="space-y-1 text-sm">
              {top.map(([w, n]) => (
                <li key={w} className="flex justify-between gap-2">
                  <span className="truncate">{w}</span>
                  <span className="tabular-nums text-muted">{n}</span>
                </li>
              ))}
            </ul>
          </Card>
        )}
      </div>
    </div>
  );
}
