import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { FilePlus2, FolderOpen, FileUp, Save, Download, X, ExternalLink, Wand2, ChevronRight, ChevronDown, File as FileIcon, Folder } from 'lucide-react';
import { clsx } from 'clsx';
import type { ToolDefinition } from '@/types/tool';
import { Button, Select, Toggle } from '@/components/ui/primitives';
import { toast } from '@/components/ui/Toast';
import { useSaver } from '@/components/tools/common';
import { useInitialFiles } from '@/hooks/useInitialFiles';
import { useResolvedTheme } from '@/hooks/useTheme';
import { kvGet, kvSet } from '@/storage/kv';
import { zipFiles } from '@/conversion/download';
import { monaco, languageFor, languages } from './monaco';

interface Tab {
  id: string;
  name: string;
  model: monaco.editor.ITextModel;
  /** File on disk (File System Access API) — Save writes back to it. */
  handle?: FileSystemFileHandle;
  savedVersion: number;
}

interface TreeNode {
  name: string;
  handle: FileSystemDirectoryHandle | FileSystemFileHandle;
  children?: TreeNode[];
}

type PickerWindow = Window & {
  showDirectoryPicker?: (o?: { mode?: 'read' | 'readwrite' }) => Promise<FileSystemDirectoryHandle>;
  showOpenFilePicker?: (o?: { multiple?: boolean }) => Promise<FileSystemFileHandle[]>;
};

const SESSION_KEY = 'code-editor-session';
const SKIP_DIRS = new Set(['node_modules', '.git', 'dist', 'build', '.next', '.cache', '__pycache__', '.venv', 'venv']);
const MAX_OPEN_BYTES = 10 * 1024 * 1024;
const VSCODE_DEV = 'https://vscode.dev';
let counter = 1;

async function readDir(dir: FileSystemDirectoryHandle): Promise<TreeNode[]> {
  const out: TreeNode[] = [];
  for await (const entry of (dir as unknown as { values(): AsyncIterable<FileSystemDirectoryHandle | FileSystemFileHandle> }).values()) {
    if (entry.kind === 'directory' && SKIP_DIRS.has(entry.name)) continue;
    out.push({ name: entry.name, handle: entry });
  }
  return out.sort((a, b) => (a.handle.kind === b.handle.kind ? a.name.localeCompare(b.name) : a.handle.kind === 'directory' ? -1 : 1));
}

function TreeItem({ node, depth, onOpen }: { node: TreeNode; depth: number; onOpen: (h: FileSystemFileHandle) => void }) {
  const [open, setOpen] = useState(false);
  const [children, setChildren] = useState<TreeNode[] | null>(null);
  const isDir = node.handle.kind === 'directory';
  return (
    <li>
      <button
        className="flex w-full items-center gap-1 truncate rounded px-1 py-0.5 text-left text-[13px] hover:bg-surface2"
        style={{ paddingLeft: 4 + depth * 12 }}
        onClick={async () => {
          if (!isDir) return onOpen(node.handle as FileSystemFileHandle);
          if (!children) setChildren(await readDir(node.handle as FileSystemDirectoryHandle));
          setOpen(!open);
        }}
        title={node.name}
      >
        {isDir ? open ? <ChevronDown size={13} /> : <ChevronRight size={13} /> : <span className="w-[13px]" />}
        {isDir ? <Folder size={13} className="shrink-0 text-accent" /> : <FileIcon size={13} className="shrink-0 text-muted" />}
        <span className="truncate">{node.name}</span>
      </button>
      {isDir && open && children && (
        <ul>
          {children.map((c) => (
            <TreeItem key={c.name} node={c} depth={depth + 1} onOpen={onOpen} />
          ))}
        </ul>
      )}
    </li>
  );
}

export default function CodeEditorTool({ initialFiles }: { tool: ToolDefinition; initialFiles?: File[] }) {
  const host = useRef<HTMLDivElement>(null);
  const editorRef = useRef<monaco.editor.IStandaloneCodeEditor | null>(null);
  const [tabs, setTabs] = useState<Tab[]>([]);
  const [active, setActive] = useState<string | null>(null);
  const [, bump] = useState(0); // re-render on dirty changes
  const [tree, setTree] = useState<{ root: string; nodes: TreeNode[] } | null>(null);
  const [wrap, setWrap] = useState(false);
  const [minimap, setMinimap] = useState(true);
  const theme = useResolvedTheme();
  const save = useSaver();
  const w = window as PickerWindow;
  const canFolder = typeof w.showDirectoryPicker === 'function';
  const tabsRef = useRef(tabs);
  tabsRef.current = tabs;

  const current = tabs.find((t) => t.id === active) ?? null;
  const dirty = (t: Tab) => t.model.getAlternativeVersionId() !== t.savedVersion;

  const addTab = useCallback((name: string, text: string, handle?: FileSystemFileHandle) => {
    const existing = handle && tabsRef.current.find((t) => t.handle && t.name === name && t.handle === handle);
    if (existing) return setActive(existing.id);
    const model = monaco.editor.createModel(text, languageFor(name));
    const tab: Tab = { id: `t${counter++}`, name, model, handle, savedVersion: model.getAlternativeVersionId() };
    model.onDidChangeContent(() => bump((n) => n + 1));
    setTabs((ts) => [...ts, tab]);
    setActive(tab.id);
  }, []);

  const openFiles = useCallback(
    async (files: File[]) => {
      for (const f of files) {
        if (f.size > MAX_OPEN_BYTES) {
          toast.warning(`${f.name} is too large to edit here`, 'Files up to 10 MB can be opened.');
          continue;
        }
        addTab(f.name, await f.text());
      }
    },
    [addTab],
  );

  // Create the editor once.
  useEffect(() => {
    const editor = monaco.editor.create(host.current!, {
      automaticLayout: true,
      fontSize: 14,
      tabSize: 2,
      scrollBeyondLastLine: false,
      fontFamily: "'Cascadia Code', 'Fira Code', Consolas, Menlo, monospace",
      model: null,
    });
    editorRef.current = editor;
    return () => {
      editor.dispose();
      for (const t of tabsRef.current) t.model.dispose();
    };
  }, []);

  useEffect(() => monaco.editor.setTheme(theme === 'dark' ? 'vs-dark' : 'vs'), [theme]);
  useEffect(() => editorRef.current?.updateOptions({ wordWrap: wrap ? 'on' : 'off', minimap: { enabled: minimap } }), [wrap, minimap]);
  useEffect(() => {
    editorRef.current?.setModel(current?.model ?? null);
    if (current) editorRef.current?.focus();
  }, [current]);

  // Restore scratch files from the last visit, unless files were handed over.
  useEffect(() => {
    if (initialFiles?.length) return;
    void kvGet<{ name: string; text: string }[]>(SESSION_KEY).then((saved) => {
      if (tabsRef.current.length) return;
      if (saved?.length) saved.forEach((s) => addTab(s.name, s.text));
      else addTab('untitled.js', '// Welcome! This is the editor from VS Code, running entirely in your browser.\n// Open files or a folder, or just start typing. Ctrl+S saves.\n\nfunction greet(name) {\n  return `Hello, ${name}!`;\n}\n\nconsole.log(greet("Dhurta"));\n');
    });
  }, []); // eslint-disable-line react-hooks/exhaustive-deps
  useInitialFiles(initialFiles, openFiles);

  // Keep unsaved scratch tabs (not files on disk) across visits.
  useEffect(() => {
    const h = setTimeout(() => {
      const scratch = tabs.filter((t) => !t.handle).map((t) => ({ name: t.name, text: t.model.getValue() }));
      if (scratch.reduce((a, s) => a + s.text.length, 0) < 2_000_000) void kvSet(SESSION_KEY, scratch);
    }, 800);
    return () => clearTimeout(h);
  });

  // Warn before leaving with unsaved changes to files on disk.
  useEffect(() => {
    const onLeave = (e: BeforeUnloadEvent) => {
      if (tabsRef.current.some((t) => t.handle && dirty(t))) e.preventDefault();
    };
    addEventListener('beforeunload', onLeave);
    return () => removeEventListener('beforeunload', onLeave);
  }, []);

  const saveTab = useCallback(
    async (tab: Tab | null = tabsRef.current.find((t) => t.id === active) ?? null) => {
      if (!tab) return;
      const text = tab.model.getValue();
      if (tab.handle) {
        try {
          const writable = await (tab.handle as unknown as { createWritable(): Promise<FileSystemWritableFileStream> }).createWritable();
          await writable.write(text);
          await writable.close();
          tab.savedVersion = tab.model.getAlternativeVersionId();
          bump((n) => n + 1);
          toast.success(`Saved ${tab.name}`);
        } catch (err) {
          if ((err as DOMException).name !== 'AbortError') toast.error(`Could not save ${tab.name}`, 'Permission may have been refused. Use Download instead.');
        }
      } else {
        await save(new Blob([text], { type: 'text/plain;charset=utf-8' }), tab.name);
        tab.savedVersion = tab.model.getAlternativeVersionId();
        bump((n) => n + 1);
      }
    },
    [active, save],
  );

  // Ctrl/Cmd+S inside the editor.
  useEffect(() => {
    const ed = editorRef.current;
    if (!ed) return;
    const d = ed.addAction({ id: 'ds.save', label: 'Save file', keybindings: [monaco.KeyMod.CtrlCmd | monaco.KeyCode.KeyS], run: () => void saveTab() });
    return () => d.dispose();
  }, [saveTab]);

  const closeTab = (tab: Tab) => {
    if (dirty(tab) && !window.confirm(`${tab.name} has unsaved changes. Close it anyway?`)) return;
    const rest = tabs.filter((t) => t.id !== tab.id);
    setTabs(rest);
    if (active === tab.id) setActive(rest.at(-1)?.id ?? null);
    tab.model.dispose();
  };

  const openFolder = async () => {
    try {
      const dir = await w.showDirectoryPicker!({ mode: 'readwrite' });
      setTree({ root: dir.name, nodes: await readDir(dir) });
    } catch (err) {
      if ((err as DOMException).name !== 'AbortError') toast.error('Could not open the folder.');
    }
  };
  const openFromDisk = async () => {
    if (w.showOpenFilePicker) {
      try {
        const handles = await w.showOpenFilePicker({ multiple: true });
        for (const h of handles) addTab(h.name, await (await h.getFile()).text(), h);
      } catch (err) {
        if ((err as DOMException).name !== 'AbortError') toast.error('Could not open the file.');
      }
    } else fileInput.current?.click();
  };
  const fileInput = useRef<HTMLInputElement>(null);

  const langOptions = useMemo(() => languages().map((l) => ({ value: l.id, label: l.label })), []);

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center gap-1.5">
        <Button size="sm" icon={<FilePlus2 size={14} />} onClick={() => addTab(`untitled-${counter}.txt`, '')}>
          New
        </Button>
        <Button size="sm" icon={<FileUp size={14} />} onClick={openFromDisk}>
          Open file
        </Button>
        {canFolder && (
          <Button size="sm" icon={<FolderOpen size={14} />} onClick={openFolder}>
            Open folder
          </Button>
        )}
        <Button size="sm" variant="primary" icon={<Save size={14} />} disabled={!current} onClick={() => void saveTab()} title="Ctrl+S">
          {current?.handle ? 'Save' : 'Download'}
        </Button>
        <Button
          size="sm"
          icon={<Download size={14} />}
          disabled={tabs.length < 2}
          onClick={async () => save(await zipFiles(tabs.map((t) => ({ name: t.name, blob: new Blob([t.model.getValue()], { type: 'text/plain' }) }))), 'code.zip')}
        >
          All as ZIP
        </Button>
        <Button size="sm" icon={<Wand2 size={14} />} disabled={!current} onClick={() => editorRef.current?.getAction('editor.action.formatDocument')?.run()} title="Shift+Alt+F">
          Format
        </Button>
        <div className="w-44">
          <Select
            label="Language"
            className="h-8 py-0 text-[13px]"
            value={current?.model.getLanguageId() ?? 'plaintext'}
            disabled={!current}
            onChange={(e) => {
              if (current) monaco.editor.setModelLanguage(current.model, e.target.value);
              bump((n) => n + 1);
            }}
            options={langOptions}
          />
        </div>
        <Toggle checked={wrap} onChange={setWrap} label="Word wrap" />
        <Toggle checked={minimap} onChange={setMinimap} label="Minimap" />
        <a href={VSCODE_DEV} target="_blank" rel="noopener noreferrer" className="ml-auto inline-flex h-8 items-center gap-1.5 rounded-md border border-line px-2.5 text-[13px] font-medium text-muted hover:text-fg" title="Microsoft does not allow vscode.dev to be embedded in other sites, so it opens in a new tab">
          <ExternalLink size={14} /> Full VS Code (vscode.dev)
        </a>
        <input ref={fileInput} type="file" multiple hidden onChange={(e) => (void openFiles(Array.from(e.target.files ?? [])), (e.target.value = ''))} />
      </div>

      <div className="flex h-[70vh] min-h-[420px] overflow-hidden rounded-lg border border-line">
        {tree && (
          <aside className="hidden w-56 shrink-0 overflow-auto border-r border-line bg-surface p-1 md:block" aria-label="Folder">
            <div className="flex items-center justify-between px-1 py-1 text-xs font-semibold uppercase tracking-wide text-muted">
              <span className="truncate">{tree.root}</span>
              <button onClick={() => setTree(null)} aria-label="Close folder" className="rounded p-0.5 hover:bg-surface2">
                <X size={12} />
              </button>
            </div>
            <ul>
              {tree.nodes.map((n) => (
                <TreeItem key={n.name} node={n} depth={0} onOpen={async (h) => addTab(h.name, await (await h.getFile()).text(), h)} />
              ))}
            </ul>
          </aside>
        )}
        <div className="flex min-w-0 flex-1 flex-col">
          <div role="tablist" aria-label="Open files" className="no-scrollbar flex overflow-x-auto border-b border-line bg-surface">
            {tabs.map((t) => (
              <div key={t.id} role="tab" aria-selected={t.id === active} className={clsx('group flex shrink-0 items-center gap-1 border-r border-line pl-3 pr-1 text-[13px]', t.id === active ? 'bg-bg text-fg' : 'text-muted hover:text-fg')}>
                <button onClick={() => setActive(t.id)} className="py-1.5" title={t.handle ? `${t.name} (on disk)` : t.name}>
                  {t.name}
                  {dirty(t) && <span className="ml-1 text-accent" aria-label="unsaved">●</span>}
                </button>
                <button onClick={() => closeTab(t)} className="rounded p-0.5 opacity-60 hover:bg-surface2 hover:opacity-100" aria-label={`Close ${t.name}`}>
                  <X size={12} />
                </button>
              </div>
            ))}
          </div>
          <div ref={host} className="min-h-0 flex-1" />
        </div>
      </div>
      <p className="text-xs text-muted">
        The editor from VS Code (Monaco): IntelliSense for JavaScript/TypeScript, JSON, HTML and CSS; syntax colouring for 80+ languages; multi-cursor, find and replace, command palette (F1). Everything stays in your browser.
        {canFolder ? ' Files opened from a folder are saved straight back to it.' : ' This browser cannot open folders, so Save downloads a copy.'} vscode.dev itself cannot be embedded — Microsoft blocks it — so the full VS Code opens in a new tab.
      </p>
    </div>
  );
}
