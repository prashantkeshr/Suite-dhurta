import { useEffect, useState } from 'react';
import { Wand2, XCircle } from 'lucide-react';
import type { Plugin } from 'prettier';
import type { ToolDefinition } from '@/types/tool';
import { Button, Segmented, Select, Toggle } from '@/components/ui/primitives';
import { TextPanel, CopyButton, DownloadTextButton } from '@/components/tools/common';
import { OpenTextButton } from '@/tools/text/shared';

type Lang = 'javascript' | 'typescript' | 'json' | 'html' | 'css' | 'scss' | 'less' | 'markdown' | 'yaml' | 'graphql' | 'sql';

const LANGS: { value: Lang; label: string; ext: string }[] = [
  { value: 'html', label: 'HTML', ext: 'html' },
  { value: 'css', label: 'CSS', ext: 'css' },
  { value: 'scss', label: 'SCSS', ext: 'scss' },
  { value: 'less', label: 'Less', ext: 'less' },
  { value: 'javascript', label: 'JavaScript / JSX', ext: 'js' },
  { value: 'typescript', label: 'TypeScript / TSX', ext: 'ts' },
  { value: 'json', label: 'JSON', ext: 'json' },
  { value: 'markdown', label: 'Markdown', ext: 'md' },
  { value: 'yaml', label: 'YAML', ext: 'yaml' },
  { value: 'graphql', label: 'GraphQL', ext: 'graphql' },
  { value: 'sql', label: 'SQL', ext: 'sql' },
];

const EXT_TO_LANG: Record<string, Lang> = { html: 'html', htm: 'html', vue: 'html', css: 'css', scss: 'scss', less: 'less', js: 'javascript', jsx: 'javascript', mjs: 'javascript', cjs: 'javascript', ts: 'typescript', tsx: 'typescript', json: 'json', md: 'markdown', yaml: 'yaml', yml: 'yaml', graphql: 'graphql', gql: 'graphql', sql: 'sql' };

const SQL_DIALECTS = [
  { value: 'sql', label: 'Standard SQL' },
  { value: 'mysql', label: 'MySQL' },
  { value: 'mariadb', label: 'MariaDB' },
  { value: 'postgresql', label: 'PostgreSQL' },
  { value: 'sqlite', label: 'SQLite' },
  { value: 'transactsql', label: 'SQL Server (T-SQL)' },
  { value: 'plsql', label: 'Oracle PL/SQL' },
  { value: 'bigquery', label: 'BigQuery' },
];

/** Load only the Prettier plugins a language needs. */
async function prettierFor(lang: Exclude<Lang, 'sql'>): Promise<{ parser: string; plugins: Plugin[] }> {
  const estree = () => import('prettier/plugins/estree');
  const babel = () => import('prettier/plugins/babel');
  const load = (...fns: (() => Promise<unknown>)[]) => Promise.all(fns.map((f) => f())) as Promise<Plugin[]>;
  switch (lang) {
    case 'javascript':
      return { parser: 'babel', plugins: await load(babel, estree) };
    case 'json':
      return { parser: 'json', plugins: await load(babel, estree) };
    case 'typescript':
      return { parser: 'typescript', plugins: await load(() => import('prettier/plugins/typescript'), estree) };
    case 'html':
      return { parser: 'html', plugins: await load(() => import('prettier/plugins/html'), () => import('prettier/plugins/postcss'), babel, estree) };
    case 'css':
    case 'scss':
    case 'less':
      return { parser: lang, plugins: await load(() => import('prettier/plugins/postcss')) };
    case 'markdown':
      return { parser: 'markdown', plugins: await load(() => import('prettier/plugins/markdown')) };
    case 'yaml':
      return { parser: 'yaml', plugins: await load(() => import('prettier/plugins/yaml')) };
    case 'graphql':
      return { parser: 'graphql', plugins: await load(() => import('prettier/plugins/graphql')) };
  }
}

export default function CodeFormatterTool({ initialFiles }: { tool: ToolDefinition; initialFiles?: File[] }) {
  const [input, setInput] = useState('');
  const [output, setOutput] = useState('');
  const [lang, setLang] = useState<Lang>('html');
  const [indent, setIndent] = useState<'2' | '4' | 'tab'>('2');
  const [width, setWidth] = useState('100');
  const [semi, setSemi] = useState(true);
  const [single, setSingle] = useState(false);
  const [dialect, setDialect] = useState('sql');
  const [keywordCase, setKeywordCase] = useState<'upper' | 'lower' | 'preserve'>('upper');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const format = async () => {
    if (!input.trim()) return;
    setBusy(true);
    setError(null);
    try {
      if (lang === 'sql') {
        const { format: sql } = await import('sql-formatter');
        setOutput(sql(input, { language: dialect as 'sql', tabWidth: indent === 'tab' ? 2 : Number(indent), useTabs: indent === 'tab', keywordCase }));
      } else {
        const [prettier, cfg] = await Promise.all([import('prettier/standalone'), prettierFor(lang)]);
        setOutput(
          await prettier.format(input, {
            parser: cfg.parser,
            plugins: cfg.plugins,
            tabWidth: indent === 'tab' ? 2 : Number(indent),
            useTabs: indent === 'tab',
            printWidth: Math.min(200, Math.max(40, Number(width) || 100)),
            semi,
            singleQuote: single,
          }),
        );
      }
    } catch (err) {
      const e = err as Error & { loc?: { start?: { line: number; column: number } } };
      const where = e.loc?.start ? ` (line ${e.loc.start.line}, column ${e.loc.start.column})` : '';
      // Prettier appends "(line:col)"; the position is shown once, in words.
      setError(`${(e.message ?? String(err)).split('\n')[0].replace(/\s*\(\d+:\d+\)\s*$/, '')}${where}`);
      setOutput('');
    } finally {
      setBusy(false);
    }
  };

  // Re-format automatically when options change after a first run.
  useEffect(() => {
    if (output) void format();
  }, [lang, indent, width, semi, single, dialect, keywordCase]);

  const ext = LANGS.find((l) => l.value === lang)!.ext;
  const jsLike = lang === 'javascript' || lang === 'typescript';

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end gap-3">
        <div className="w-52">
          <Select label="Language" value={lang} onChange={(e) => (setLang(e.target.value as Lang), setError(null))} options={LANGS} />
        </div>
        <Segmented label="Indent" value={indent} onChange={setIndent} options={[{ value: '2', label: '2' }, { value: '4', label: '4' }, { value: 'tab', label: 'Tab' }]} />
        {lang === 'sql' ? (
          <>
            <div className="w-48">
              <Select label="Dialect" value={dialect} onChange={(e) => setDialect(e.target.value)} options={SQL_DIALECTS} />
            </div>
            <Segmented label="Keywords" value={keywordCase} onChange={setKeywordCase} options={[{ value: 'upper', label: 'UPPER' }, { value: 'lower', label: 'lower' }, { value: 'preserve', label: 'Keep' }]} />
          </>
        ) : (
          <div className="w-28">
            <label htmlFor="cf-width" className="label">
              Line width
            </label>
            <input id="cf-width" className="input" inputMode="numeric" value={width} onChange={(e) => setWidth(e.target.value.replace(/\D/g, ''))} />
          </div>
        )}
        {jsLike && (
          <>
            <Toggle checked={semi} onChange={setSemi} label="Semicolons" />
            <Toggle checked={single} onChange={setSingle} label="Single quotes" />
          </>
        )}
        <Button variant="primary" loading={busy} onClick={format} icon={<Wand2 size={16} />} disabled={!input.trim()}>
          Format
        </Button>
      </div>
      {error && (
        <p role="alert" className="flex items-start gap-1.5 text-sm text-error">
          <XCircle size={16} className="mt-0.5 shrink-0" aria-hidden /> Could not format: {error}
        </p>
      )}
      <div className="grid gap-4 md:grid-cols-2">
        <TextPanel
          id="cf-in"
          label="Code"
          value={input}
          onChange={setInput}
          rows={20}
          placeholder="Paste code here…"
          actions={
            <OpenTextButton
              accept={Object.keys(EXT_TO_LANG).map((e) => '.' + e).join(',')}
              initialFiles={initialFiles}
              onText={(t, n) => {
                setInput(t);
                const l = EXT_TO_LANG[n.split('.').pop()?.toLowerCase() ?? ''];
                if (l) setLang(l);
              }}
            />
          }
        />
        <TextPanel
          id="cf-out"
          label="Formatted"
          value={output}
          readOnly
          rows={20}
          actions={
            <>
              <CopyButton text={output} />
              <DownloadTextButton text={output} filename={`formatted.${ext}`} />
            </>
          }
        />
      </div>
      <p className="text-xs text-muted">Formatting uses Prettier and sql-formatter inside your browser. Code is parsed, never run. Minification is not offered because it can change behaviour if done carelessly.</p>
    </div>
  );
}
