import { useDeferredValue, useMemo, useState } from 'react';
import { CheckCircle2, XCircle } from 'lucide-react';
import type { ToolDefinition } from '@/types/tool';
import { Segmented } from '@/components/ui/primitives';
import { TextPanel, CopyButton, DownloadTextButton } from '@/components/tools/common';
import { OpenTextButton } from '@/tools/text/shared';
import { formatXml, minifyXml, validateXml } from './xml';

export default function XmlTool({ initialFiles }: { tool: ToolDefinition; initialFiles?: File[] }) {
  const [input, setInput] = useState('');
  const [mode, setMode] = useState<'format' | 'minify'>('format');
  const [indent, setIndent] = useState<'2' | '4' | 'tab'>('2');
  const [name, setName] = useState('formatted.xml');
  const deferred = useDeferredValue(input);

  const check = useMemo(() => (deferred.trim() ? validateXml(deferred) : null), [deferred]);
  const output = useMemo(() => {
    if (!deferred.trim() || !check?.ok) return '';
    return mode === 'minify' ? minifyXml(deferred) : formatXml(deferred, indent === 'tab' ? '\t' : Number(indent));
  }, [deferred, check, mode, indent]);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end gap-4">
        <Segmented label="Mode" value={mode} onChange={setMode} options={[{ value: 'format', label: 'Format' }, { value: 'minify', label: 'Minify' }]} />
        {mode === 'format' && <Segmented label="Indent" value={indent} onChange={setIndent} options={[{ value: '2', label: '2 spaces' }, { value: '4', label: '4 spaces' }, { value: 'tab', label: 'Tabs' }]} />}
      </div>
      {check && (
        <p aria-live="polite" className={`flex items-start gap-1.5 text-sm ${check.ok ? 'text-success' : 'text-error'}`}>
          {check.ok ? <CheckCircle2 size={16} className="mt-0.5 shrink-0" aria-hidden /> : <XCircle size={16} className="mt-0.5 shrink-0" aria-hidden />}
          {check.ok ? 'Well-formed XML' : `Not well-formed${check.line ? ` (line ${check.line}, column ${check.column})` : ''}: ${check.message}`}
        </p>
      )}
      <div className="grid gap-4 md:grid-cols-2">
        <TextPanel id="xml-in" label="XML" value={input} onChange={setInput} rows={18} invalid={check ? !check.ok : false} placeholder="<note><to>Asha</to></note>" actions={<OpenTextButton accept=".xml,.svg,.xsd,.xsl,.rss,.atom,.plist,application/xml,text/xml" onText={(t, n) => (setInput(t), setName(n.replace(/(\.[^.]+)?$/, mode === 'minify' ? '.min$1' : '$1')))} initialFiles={initialFiles} />} />
        <TextPanel
          id="xml-out"
          label="Result"
          value={output}
          readOnly
          rows={18}
          actions={
            <>
              <CopyButton text={output} />
              <DownloadTextButton text={output} filename={name} mime="application/xml" />
            </>
          }
        />
      </div>
      <p className="text-xs text-muted">Checks that the XML is well-formed; it does not validate against a schema (XSD/DTD). Whitespace inside text is collapsed when formatting.</p>
    </div>
  );
}
