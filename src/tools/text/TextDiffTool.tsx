import { useDeferredValue, useEffect, useMemo, useState } from 'react';
import { clsx } from 'clsx';
import { ArrowLeftRight } from 'lucide-react';
import type { Change } from 'diff';
import type { ToolDefinition } from '@/types/tool';
import { Button, Card, Segmented, Toggle } from '@/components/ui/primitives';
import { TextPanel, DownloadTextButton } from '@/components/tools/common';
import { OpenTextButton } from './shared';

type DiffLib = typeof import('diff');
type Mode = 'lines' | 'words' | 'chars';
const MAX_CHARS = 2_000_000;

interface SideRow {
  left?: { n: number; text: string; kind: 'same' | 'removed' };
  right?: { n: number; text: string; kind: 'same' | 'added' };
}

/** Pair removed/added line blocks so changed lines sit side by side. */
function toSideBySide(changes: Change[]): SideRow[] {
  const rows: SideRow[] = [];
  let ln = 1;
  let rn = 1;
  const lines = (v: string) => v.replace(/\n$/, '').split('\n');
  for (let i = 0; i < changes.length; i++) {
    const c = changes[i];
    if (!c.added && !c.removed) {
      for (const text of lines(c.value)) rows.push({ left: { n: ln++, text, kind: 'same' }, right: { n: rn++, text, kind: 'same' } });
    } else if (c.removed && changes[i + 1]?.added) {
      const l = lines(c.value);
      const r = lines(changes[i + 1].value);
      for (let k = 0; k < Math.max(l.length, r.length); k++) rows.push({ left: k < l.length ? { n: ln++, text: l[k], kind: 'removed' } : undefined, right: k < r.length ? { n: rn++, text: r[k], kind: 'added' } : undefined });
      i++;
    } else if (c.removed) {
      for (const text of lines(c.value)) rows.push({ left: { n: ln++, text, kind: 'removed' } });
    } else {
      for (const text of lines(c.value)) rows.push({ right: { n: rn++, text, kind: 'added' } });
    }
  }
  return rows;
}

export default function TextDiffTool({ initialFiles }: { tool: ToolDefinition; initialFiles?: File[] }) {
  const [a, setA] = useState('');
  const [b, setB] = useState('');
  const [names, setNames] = useState(['original.txt', 'changed.txt']);
  const [mode, setMode] = useState<Mode>('lines');
  const [view, setView] = useState<'split' | 'unified'>('split');
  const [ignoreWs, setIgnoreWs] = useState(false);
  const [ignoreCase, setIgnoreCase] = useState(false);
  const [lib, setLib] = useState<DiffLib | null>(null);
  const da = useDeferredValue(a);
  const db = useDeferredValue(b);

  useEffect(() => {
    import('diff').then(setLib);
  }, []);

  // Two dropped files: compare them directly.
  useEffect(() => {
    if (initialFiles && initialFiles.length >= 2) {
      void Promise.all(initialFiles.slice(0, 2).map((f) => f.text())).then(([x, y]) => {
        setA(x);
        setB(y);
        setNames([initialFiles[0].name, initialFiles[1].name]);
      });
    }
  }, [initialFiles]);

  const tooBig = da.length + db.length > MAX_CHARS;
  const changes = useMemo<Change[] | null>(() => {
    if (!lib || tooBig || (!da && !db)) return null;
    if (mode === 'lines') {
      // Compare line arrays so case/whitespace can be ignored while showing the original text.
      const norm = (l: string) => {
        let x = ignoreWs ? l.trim().replace(/\s+/g, ' ') : l;
        if (ignoreCase) x = x.toLocaleLowerCase();
        return x;
      };
      const split = (t: string) => (t ? t.replace(/\r\n?/g, '\n').replace(/\n$/, '').split('\n') : []);
      return lib
        .diffArrays(split(da), split(db), { comparator: (x, y) => norm(x) === norm(y) })
        .map((c) => ({ ...c, value: c.value.join('\n') + '\n', count: c.value.length })) as unknown as Change[];
    }
    if (mode === 'words') return ignoreWs ? lib.diffWords(da, db, { ignoreCase }) : lib.diffWordsWithSpace(da, db, { ignoreCase });
    return lib.diffChars(da, db, { ignoreCase });
  }, [lib, da, db, mode, ignoreWs, ignoreCase, tooBig]);

  const stats = useMemo(() => {
    if (!changes) return null;
    const count = (c: Change) => (mode === 'lines' ? (c.count ?? 0) : c.value.length);
    return {
      added: changes.filter((c) => c.added).reduce((s, c) => s + count(c), 0),
      removed: changes.filter((c) => c.removed).reduce((s, c) => s + count(c), 0),
      same: changes.every((c) => !c.added && !c.removed),
    };
  }, [changes, mode]);

  const patch = useMemo(() => (lib && !tooBig && (da || db) ? lib.createTwoFilesPatch(names[0], names[1], da, db, undefined, undefined, { context: 3 }) : ''), [lib, da, db, names, tooBig]);
  const unit = mode === 'lines' ? 'lines' : 'characters';

  return (
    <div className="space-y-4">
      <div className="grid items-start gap-4 md:grid-cols-[1fr_auto_1fr]">
        <TextPanel id="diff-a" label="Original" value={a} onChange={setA} rows={10} actions={<OpenTextButton onText={(t, n) => (setA(t), setNames([n, names[1]]))} />} />
        <div className="flex justify-center md:pt-24">
          <Button size="icon" aria-label="Swap texts" title="Swap" onClick={() => (setA(b), setB(a), setNames([names[1], names[0]]))}>
            <ArrowLeftRight size={16} />
          </Button>
        </div>
        <TextPanel id="diff-b" label="Changed" value={b} onChange={setB} rows={10} actions={<OpenTextButton onText={(t, n) => (setB(t), setNames([names[0], n]))} />} />
      </div>

      <div className="flex flex-wrap items-end gap-4">
        <Segmented label="Compare by" value={mode} onChange={setMode} options={[{ value: 'lines', label: 'Lines' }, { value: 'words', label: 'Words' }, { value: 'chars', label: 'Characters' }]} />
        {mode === 'lines' && <Segmented label="View" value={view} onChange={setView} options={[{ value: 'split', label: 'Side by side' }, { value: 'unified', label: 'Unified' }]} />}
        <Toggle checked={ignoreWs} onChange={setIgnoreWs} label="Ignore whitespace" />
        <Toggle checked={ignoreCase} onChange={setIgnoreCase} label="Ignore case" />
        <div className="ml-auto">
          <DownloadTextButton text={patch} filename="changes.patch" label="Download .patch" />
        </div>
      </div>

      {tooBig && <p className="text-sm text-warning">These texts are too large to compare in the browser (over 2 million characters combined).</p>}
      {stats && (
        <p className="text-sm" aria-live="polite">
          {stats.same ? (
            <span className="text-success">The texts are identical{ignoreWs || ignoreCase ? ' (with the chosen options)' : ''}.</span>
          ) : (
            <>
              <span className="text-success">+{stats.added}</span> <span className="text-error">−{stats.removed}</span> <span className="text-muted">{unit}</span>
            </>
          )}
        </p>
      )}

      {changes && !stats?.same && (
        <Card className="overflow-hidden">
          {mode !== 'lines' ? (
            <pre className="max-h-[560px] overflow-auto whitespace-pre-wrap break-words p-3 font-mono text-[13px] leading-relaxed">
              {changes.map((c, i) => (
                <span key={i} className={clsx(c.added && 'bg-success/20 text-fg', c.removed && 'bg-error/20 text-fg line-through decoration-error/60')}>
                  {c.value}
                </span>
              ))}
            </pre>
          ) : view === 'unified' ? (
            <pre className="max-h-[560px] overflow-auto p-0 font-mono text-[13px] leading-relaxed">
              {changes.flatMap((c, i) =>
                c.value
                  .replace(/\n$/, '')
                  .split('\n')
                  .map((line, k) => (
                    <div key={`${i}-${k}`} className={clsx('whitespace-pre-wrap px-3', c.added && 'bg-success/15', c.removed && 'bg-error/15')}>
                      <span className="mr-2 select-none text-muted">{c.added ? '+' : c.removed ? '−' : ' '}</span>
                      {line}
                    </div>
                  )),
              )}
            </pre>
          ) : (
            <div className="max-h-[560px] overflow-auto font-mono text-[13px] leading-relaxed">
              <table className="w-full table-fixed border-collapse">
                <tbody>
                  {toSideBySide(changes).map((r, i) => (
                    <tr key={i} className="align-top">
                      <td className="w-10 select-none border-r border-line px-1 text-right text-xs text-muted">{r.left?.n}</td>
                      <td className={clsx('whitespace-pre-wrap break-words border-r border-line px-2', r.left?.kind === 'removed' && 'bg-error/15', !r.left && 'bg-surface2')}>{r.left?.text}</td>
                      <td className="w-10 select-none border-r border-line px-1 text-right text-xs text-muted">{r.right?.n}</td>
                      <td className={clsx('whitespace-pre-wrap break-words px-2', r.right?.kind === 'added' && 'bg-success/15', !r.right && 'bg-surface2')}>{r.right?.text}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Card>
      )}
    </div>
  );
}
