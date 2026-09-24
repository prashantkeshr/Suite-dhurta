import { useDeferredValue, useEffect, useMemo, useState } from 'react';
import { clsx } from 'clsx';
import type { ToolDefinition } from '@/types/tool';
import { useStore } from '@/storage/store';
import { countText } from '@/tools/text/logic';
import { OpenTextButton } from '@/tools/text/shared';
import { Card, Segmented } from '@/components/ui/primitives';
import { toast } from '@/components/ui/Toast';
import { CopyButton, DownloadTextButton } from '@/components/tools/common';
import { documentHtml, printHtml, DEFAULT_PAGE, type PageOptions } from './print';
import { PageOptionsPanel } from './PageOptionsPanel';

type Libs = { marked: typeof import('marked').marked; purify: typeof import('dompurify').default };

const SAMPLE = `# Project notes

Write **Markdown** on the left and see the result on the right. Hindi works too: **नमस्ते दुनिया**.

## Checklist
- [x] Headings, *emphasis* and [links](https://example.com)
- [ ] Tables and code blocks

| Tool | Runs in |
|------|---------|
| Markdown editor | Your browser |

\`\`\`js
console.log('Nothing is uploaded');
\`\`\`

> Export as HTML, or choose **Save as PDF**.
`;

let libsPromise: Promise<Libs> | null = null;
function loadLibs(): Promise<Libs> {
  if (!libsPromise) {
    libsPromise = Promise.all([import('marked'), import('dompurify')]).then(([m, d]) => {
      const purify = d.default;
      // Links open in a new tab without giving the page access to this one.
      purify.addHook('afterSanitizeAttributes', (node) => {
        if (node.tagName === 'A' && node.getAttribute('href')) {
          node.setAttribute('target', '_blank');
          node.setAttribute('rel', 'noopener noreferrer nofollow');
        }
      });
      return { marked: m.marked, purify };
    });
  }
  return libsPromise;
}

export default function MarkdownTool({ tool, initialFiles }: { tool: ToolDefinition; initialFiles?: File[] }) {
  const toPdf = tool.id === 'markdown-to-pdf';
  const [text, setText] = useState(SAMPLE);
  const [name, setName] = useState('document');
  const [view, setView] = useState<'split' | 'edit' | 'preview'>('split');
  const [libs, setLibs] = useState<Libs | null>(null);
  const [page, setPage] = useState<PageOptions>(DEFAULT_PAGE);
  const [printing, setPrinting] = useState(false);
  const addHistory = useStore((s) => s.addHistory);
  const deferred = useDeferredValue(text);

  useEffect(() => {
    loadLibs().then(setLibs);
  }, []);

  const html = useMemo(() => {
    if (!libs) return '';
    const raw = libs.marked.parse(deferred, { async: false, gfm: true, breaks: false }) as string;
    return libs.purify.sanitize(raw, { USE_PROFILES: { html: true } });
  }, [libs, deferred]);
  const words = useMemo(() => countText(deferred).words, [deferred]);
  const standalone = useMemo(() => documentHtml(html, name, page), [html, name, page]);

  const print = async () => {
    setPrinting(true);
    try {
      await printHtml(standalone);
      addHistory(tool.id, 'Markdown → PDF (print)');
    } catch {
      toast.error('Printing is not available here', 'Download the HTML file and print it from your browser instead.');
    } finally {
      setPrinting(false);
    }
  };

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-end gap-3">
        <Segmented label="View" value={view} onChange={setView} options={[{ value: 'split', label: 'Split' }, { value: 'edit', label: 'Write' }, { value: 'preview', label: 'Preview' }]} />
        <div className="flex flex-wrap gap-2">
          <OpenTextButton accept=".md,.markdown,.txt,text/markdown,text/plain" onText={(t, n) => (setText(t), setName(n.replace(/\.[^.]+$/, '')))} initialFiles={initialFiles} />
          <DownloadTextButton text={text} filename={`${name}.md`} mime="text/markdown" label=".md" />
          <DownloadTextButton text={standalone} filename={`${name}.html`} mime="text/html" label=".html" />
          <CopyButton text={html} label="Copy HTML" />
        </div>
        <p className="ml-auto text-xs text-muted">{words.toLocaleString()} words</p>
      </div>

      <div className={clsx('grid gap-4', toPdf ? 'lg:grid-cols-[1fr_280px]' : '')}>
        <div className={clsx('grid gap-4', view === 'split' && 'md:grid-cols-2')}>
          {view !== 'preview' && (
            <textarea aria-label="Markdown source" className="textarea min-h-[520px]" value={text} onChange={(e) => setText(e.target.value)} spellCheck />
          )}
          {view !== 'edit' && (
            <Card className="min-h-[520px] overflow-auto bg-white p-5 text-neutral-900">
              {/* Sanitised with DOMPurify before rendering. */}
              <article className="markdown-body" dangerouslySetInnerHTML={{ __html: html }} />
            </Card>
          )}
        </div>
        {toPdf ? (
          <Card className="h-fit p-4 lg:sticky lg:top-20">
            <PageOptionsPanel value={page} onChange={setPage} onPrint={print} busy={printing} />
          </Card>
        ) : (
          <Card className="p-4">
            <PageOptionsPanel value={page} onChange={setPage} onPrint={print} busy={printing} />
          </Card>
        )}
      </div>
    </div>
  );
}
