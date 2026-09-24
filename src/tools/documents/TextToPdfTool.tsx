import { useMemo, useState } from 'react';
import type { ToolDefinition } from '@/types/tool';
import { useStore } from '@/storage/store';
import { OpenTextButton } from '@/tools/text/shared';
import { Card } from '@/components/ui/primitives';
import { toast } from '@/components/ui/Toast';
import { TextPanel } from '@/components/tools/common';
import { documentHtml, plainTextHtml, printHtml, DEFAULT_PAGE, type PageOptions } from './print';
import { PageOptionsPanel } from './PageOptionsPanel';

export default function TextToPdfTool({ tool, initialFiles }: { tool: ToolDefinition; initialFiles?: File[] }) {
  const [text, setText] = useState('');
  const [name, setName] = useState('document');
  const [page, setPage] = useState<PageOptions>(DEFAULT_PAGE);
  const [printing, setPrinting] = useState(false);
  const addHistory = useStore((s) => s.addHistory);
  const html = useMemo(() => documentHtml(plainTextHtml(text), name, page), [text, name, page]);

  const print = async () => {
    if (!text.trim()) return toast.warning('Add some text first');
    setPrinting(true);
    try {
      await printHtml(html);
      addHistory(tool.id, 'Text → PDF (print)');
    } catch {
      toast.error('Printing is not available here', 'Try a different browser.');
    } finally {
      setPrinting(false);
    }
  };

  return (
    <div className="grid gap-4 lg:grid-cols-[1fr_280px]">
      <TextPanel
        id="t2p"
        label="Text"
        value={text}
        onChange={setText}
        rows={22}
        placeholder="Type or paste text. Hindi and other Indian languages print correctly: यह पाठ PDF में सही दिखेगा।"
        actions={<OpenTextButton onText={(t, n) => (setText(t), setName(n.replace(/\.[^.]+$/, '')))} initialFiles={initialFiles} />}
      />
      <Card className="h-fit p-4 lg:sticky lg:top-20">
        <PageOptionsPanel value={page} onChange={setPage} onPrint={print} busy={printing} />
      </Card>
    </div>
  );
}
