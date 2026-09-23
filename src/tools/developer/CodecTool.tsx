import { useMemo, useState } from 'react';
import { ArrowDownUp } from 'lucide-react';
import type { ToolDefinition } from '@/types/tool';
import { Button, Segmented, Toggle } from '@/components/ui/primitives';
import { TextPanel, CopyButton } from '@/components/tools/common';
import { base64Encode, base64Decode, urlEncode, urlDecode, encodeEntities, decodeEntities } from './logic';

type Direction = 'encode' | 'decode';

export default function CodecTool({ tool }: { tool: ToolDefinition }) {
  const [input, setInput] = useState('');
  const [direction, setDirection] = useState<Direction>('encode');
  const [urlSafe, setUrlSafe] = useState(false);
  const [urlMode, setUrlMode] = useState<'component' | 'uri'>('component');
  const [plus, setPlus] = useState(true);
  const [entityMode, setEntityMode] = useState<'minimal' | 'nonascii'>('minimal');

  const { output, error } = useMemo(() => {
    if (!input) return { output: '', error: null };
    try {
      let out = '';
      if (tool.id === 'base64-text') out = direction === 'encode' ? base64Encode(input, urlSafe) : base64Decode(input);
      else if (tool.id === 'url-encoder') out = direction === 'encode' ? urlEncode(input, urlMode) : urlDecode(input, plus);
      else out = direction === 'encode' ? encodeEntities(input, entityMode) : decodeEntities(input);
      return { output: out, error: null };
    } catch (err) {
      const msg = (err as Error).message;
      return { output: '', error: /URI malformed/i.test(msg) ? 'The input contains an invalid percent-encoded sequence (for example a lone “%”).' : msg };
    }
  }, [input, direction, tool.id, urlSafe, urlMode, plus, entityMode]);

  const swap = () => {
    if (error) return;
    setInput(output);
    setDirection(direction === 'encode' ? 'decode' : 'encode');
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end gap-4">
        <Segmented label="Mode" value={direction} onChange={setDirection} options={[{ value: 'encode', label: 'Encode' }, { value: 'decode', label: 'Decode' }]} />
        {tool.id === 'base64-text' && direction === 'encode' && <Toggle checked={urlSafe} onChange={setUrlSafe} label="URL-safe (Base64URL)" />}
        {tool.id === 'url-encoder' && direction === 'encode' && (
          <Segmented label="Encode as" value={urlMode} onChange={setUrlMode} options={[{ value: 'component', label: 'Parameter value' }, { value: 'uri', label: 'Full URL' }]} />
        )}
        {tool.id === 'url-encoder' && direction === 'decode' && <Toggle checked={plus} onChange={setPlus} label="Treat + as space" />}
        {tool.id === 'html-entities' && direction === 'encode' && (
          <Segmented label="Escape" value={entityMode} onChange={setEntityMode} options={[{ value: 'minimal', label: 'HTML special chars' }, { value: 'nonascii', label: 'Also non-ASCII' }]} />
        )}
      </div>
      <div className="grid items-start gap-4 md:grid-cols-[1fr_auto_1fr]">
        <TextPanel id="codec-in" label={direction === 'encode' ? 'Plain text' : 'Encoded text'} value={input} onChange={setInput} rows={12} />
        <div className="flex justify-center md:pt-24">
          <Button size="icon" onClick={swap} aria-label="Swap input and output" title="Use result as input and switch direction">
            <ArrowDownUp size={16} className="md:rotate-90" />
          </Button>
        </div>
        <TextPanel id="codec-out" label={direction === 'encode' ? 'Encoded' : 'Decoded'} value={error ? '' : output} readOnly rows={12} actions={<CopyButton text={output} disabled={!!error} />} />
      </div>
      {error && (
        <p role="alert" className="text-sm text-error">
          {error}
        </p>
      )}
      {tool.id === 'base64-text' && <p className="text-xs text-muted">Base64 is an encoding, not encryption — anyone can decode it.</p>}
    </div>
  );
}
