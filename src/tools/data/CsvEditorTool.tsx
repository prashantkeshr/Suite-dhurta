import { useCallback, useEffect, useMemo, useState } from 'react';
import { Columns3, Download, Eraser, MoreVertical, Plus, Search, Trash2, Undo2, X, Merge, CopyMinus } from 'lucide-react';
import type { ToolDefinition } from '@/types/tool';
import { acceptAttribute, formatLabel } from '@/tools/registry';
import { useInitialFiles } from '@/hooks/useInitialFiles';
import { useStore } from '@/storage/store';
import { formatNumber } from '@/utils/format';
import { outputName } from '@/utils/filename';
import { t as tr } from '@/i18n';
import { Button, Card, Select, Toggle } from '@/components/ui/primitives';
import { Dialog } from '@/components/ui/Dialog';
import { EmptyState, ErrorState } from '@/components/ui/states';
import { toast } from '@/components/ui/Toast';
import { FileDropzone } from '@/components/files/FileDropzone';
import { DataGrid, type SortState } from '@/components/data/DataGrid';
import { useSaver, CopyButton } from '@/components/tools/common';
import { readTextFile } from '@/tools/text/shared';
import { parseCsv, detectDelimiter, rowsToCsv, type Delimiter } from './csv';
import { fromRows, sortRows, filterRows, removeDuplicateRows, removeEmptyRows, trimCells, splitColumn, mergeColumns, deleteColumn, renameColumn, caseColumn, columnStats, tableToObjects, type Table } from './table';

const DELIM_LABEL: Record<Delimiter, string> = { ',': 'Comma', ';': 'Semicolon', '\t': 'Tab', '|': 'Pipe' };

/** Excel treats cells starting with these as formulas; prefixing a quote neutralises them. */
const neutralise = (v: string) => (/^[=+@]/.test(v) || /^-[^\d.]/.test(v) ? `'${v}` : v);

export default function CsvEditorTool({ tool, initialFiles }: { tool: ToolDefinition; initialFiles?: File[] }) {
  const [raw, setRaw] = useState<{ text: string; name: string } | null>(null);
  const [delimiter, setDelimiter] = useState<Delimiter>(',');
  const [hasHeader, setHasHeader] = useState(true);
  const [table, setTable] = useState<Table | null>(null);
  const [history, setHistory] = useState<Table[]>([]);
  const [filter, setFilter] = useState('');
  const [sort, setSort] = useState<SortState | null>(null);
  const [colMenu, setColMenu] = useState<number | null>(null);
  const [mergeOpen, setMergeOpen] = useState(false);
  const [error, setError] = useState<unknown>(null);
  const [paste, setPaste] = useState('');
  const [exportDelim, setExportDelim] = useState<Delimiter>(',');
  const [bom, setBom] = useState(true);
  const [safe, setSafe] = useState(false);
  const save = useSaver();
  const addHistory = useStore((s) => s.addHistory);

  const load = useCallback((text: string, name: string) => {
    const d = detectDelimiter(text);
    setDelimiter(d);
    setExportDelim(d);
    setRaw({ text, name });
  }, []);

  // (Re)parse when the source, delimiter or header option changes.
  useEffect(() => {
    if (!raw) return;
    const rows = parseCsv(raw.text, delimiter);
    if (!rows.length) {
      setError(new Error('The file has no rows.'));
      setTable(null);
      return;
    }
    setError(null);
    setTable(fromRows(rows, hasHeader));
    setHistory([]);
    setSort(null);
  }, [raw, delimiter, hasHeader]);

  const open = useCallback(
    async (files: File[]) => {
      try {
        load(await readTextFile(files[0]), files[0].name);
      } catch (err) {
        setError(err);
      }
    },
    [load],
  );
  useInitialFiles(initialFiles, open);

  /** Apply a change with undo support. */
  const apply = useCallback(
    (next: Table, message?: string) => {
      if (!table) return;
      setHistory((h) => [...h.slice(-29), table]);
      setTable(next);
      if (message) toast.success(message);
    },
    [table],
  );
  const undo = useCallback(() => {
    if (!history.length) return;
    setTable(history[history.length - 1]);
    setHistory(history.slice(0, -1));
  }, [history]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const el = e.target as HTMLElement;
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z' && !/^(INPUT|TEXTAREA)$/.test(el.tagName)) {
        e.preventDefault();
        undo();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [undo]);

  const order = useMemo(() => (table ? filterRows(table.rows, filter) : []), [table, filter]);

  const onSort = (col: number) => {
    if (!table) return;
    const dir = sort?.col === col && sort.dir === 'asc' ? 'desc' : 'asc';
    setSort({ col, dir });
    apply({ ...table, rows: sortRows(table.rows, col, dir) });
  };

  const exportCsv = () => {
    if (!table) return;
    const rows = safe ? table.rows.map((r) => r.map(neutralise)) : table.rows;
    const text = (bom ? '﻿' : '') + rowsToCsv(table.header, rows, exportDelim);
    void save(new Blob([text], { type: 'text/csv;charset=utf-8' }), outputName(raw?.name ?? 'data.csv', 'edited', exportDelim === '\t' ? 'tsv' : 'csv'));
    addHistory(tool.id, `Exported ${table.rows.length} rows as CSV`);
  };
  const exportJson = () => {
    if (!table) return;
    void save(new Blob([JSON.stringify(tableToObjects(table), null, 2)], { type: 'application/json' }), outputName(raw?.name ?? 'data.csv', '', 'json'));
    addHistory(tool.id, `Exported ${table.rows.length} rows as JSON`);
  };

  if (!table) {
    return (
      <div className="space-y-4">
        <FileDropzone onFiles={open} accept={acceptAttribute(tool)} acceptLabel={formatLabel(tool.inputTypes)} multiple={false} />
        {error != null && <ErrorState error={error} />}
        <Card className="space-y-2 p-4">
          <label htmlFor="csv-paste" className="label">
            Or paste CSV / TSV
          </label>
          <textarea id="csv-paste" rows={6} className="textarea" value={paste} onChange={(e) => setPaste(e.target.value)} placeholder={'name,city\nAsha,Pune'} />
          <Button variant="primary" disabled={!paste.trim()} onClick={() => load(paste, 'pasted.csv')}>
            Open pasted data
          </Button>
        </Card>
      </div>
    );
  }

  const colStats = colMenu !== null ? columnStats(table.rows, colMenu) : null;

  return (
    <div className="space-y-3">
      <Card className="flex flex-wrap items-end gap-3 p-3">
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-medium">{raw?.name}</p>
          <p className="text-xs text-muted">
            {formatNumber(table.rows.length)} rows · {table.header.length} columns{filter && ` · ${formatNumber(order.length)} shown`}
          </p>
        </div>
        <Select label="Delimiter" value={delimiter} onChange={(e) => setDelimiter(e.target.value as Delimiter)} options={Object.entries(DELIM_LABEL).map(([value, label]) => ({ value, label }))} />
        <Toggle checked={hasHeader} onChange={setHasHeader} label="Header row" />
        <Button size="sm" variant="ghost" icon={<X size={14} />} onClick={() => (setTable(null), setRaw(null))}>
          Close
        </Button>
      </Card>

      <div className="flex flex-wrap items-center gap-2">
        <div className="relative min-w-[200px] flex-1">
          <Search size={15} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted" aria-hidden />
          <input className="input pl-9" placeholder="Filter rows…" aria-label="Filter rows" value={filter} onChange={(e) => setFilter(e.target.value)} />
        </div>
        <Button size="sm" icon={<Undo2 size={14} />} disabled={!history.length} onClick={undo} title="Undo (Ctrl+Z)">
          Undo
        </Button>
        <Button size="sm" icon={<Plus size={14} />} onClick={() => apply({ ...table, rows: [...table.rows, table.header.map(() => '')] })}>
          Row
        </Button>
        <Button size="sm" icon={<Eraser size={14} />} onClick={() => apply(trimCells(table), 'Trimmed whitespace')}>
          Trim
        </Button>
        <Button
          size="sm"
          icon={<CopyMinus size={14} />}
          onClick={() => {
            const r = removeDuplicateRows(table.rows, { trim: true });
            if (r.removed) apply({ ...table, rows: r.rows }, `Removed ${r.removed} duplicate row${r.removed > 1 ? 's' : ''}`);
            else toast.info('No duplicate rows found');
          }}
        >
          Remove duplicates
        </Button>
        <Button
          size="sm"
          onClick={() => {
            const r = removeEmptyRows(table.rows);
            if (r.removed) apply({ ...table, rows: r.rows }, `Removed ${r.removed} empty row${r.removed > 1 ? 's' : ''}`);
            else toast.info('No empty rows found');
          }}
        >
          Remove empty rows
        </Button>
        <Button size="sm" icon={<Merge size={14} />} onClick={() => setMergeOpen(true)} disabled={table.header.length < 2}>
          Merge columns
        </Button>
      </div>

      {order.length === 0 ? (
        <EmptyState title="No rows match the filter" />
      ) : (
        <DataGrid
          label="CSV data"
          header={table.header}
          rows={table.rows}
          order={order}
          sort={sort}
          onSort={onSort}
          onEdit={(r, c, v) => {
            if (table.rows[r][c] === v) return;
            apply({ ...table, rows: table.rows.map((row, i) => (i === r ? row.map((x, j) => (j === c ? v : x)) : row)) });
          }}
          headerExtra={(c) => (
            <button onClick={() => setColMenu(c)} aria-label={`Column options for ${table.header[c]}`} className="rounded p-1 text-muted hover:bg-surface hover:text-fg">
              <MoreVertical size={13} />
            </button>
          )}
          rowActions={(r) => (
            <button onClick={() => apply({ ...table, rows: table.rows.filter((_, i) => i !== r) })} aria-label="Delete row" title="Delete row" className="rounded p-1 text-muted hover:text-error">
              <Trash2 size={13} />
            </button>
          )}
          height={Math.min(560, 40 + order.length * 34)}
        />
      )}
      <p className="text-xs text-muted">Double-click a cell (or press Enter) to edit. Click a column name to sort. Filtering only changes what you see; exports include every row.</p>

      <Card className="flex flex-wrap items-end gap-3 p-3">
        <Select label="Export delimiter" value={exportDelim} onChange={(e) => setExportDelim(e.target.value as Delimiter)} options={Object.entries(DELIM_LABEL).map(([value, label]) => ({ value, label }))} />
        <Toggle checked={bom} onChange={setBom} label="Excel-friendly (UTF-8 BOM)" />
        <Toggle checked={safe} onChange={setSafe} label="Neutralise formulas" description="Prefixes cells starting with = + - @ so Excel won't run them." />
        <div className="ml-auto flex flex-wrap gap-2">
          <CopyButton text={rowsToCsv(table.header, table.rows, exportDelim)} label="Copy CSV" />
          <Button icon={<Download size={16} />} onClick={exportJson}>
            JSON
          </Button>
          <Button variant="primary" icon={<Download size={16} />} onClick={exportCsv}>
            {tr('action.download')} CSV
          </Button>
        </div>
      </Card>

      <ColumnDialog
        open={colMenu !== null}
        col={colMenu}
        table={table}
        stats={colStats}
        onClose={() => setColMenu(null)}
        onApply={(next, msg) => {
          apply(next, msg);
          setColMenu(null);
        }}
      />
      <MergeDialog open={mergeOpen} table={table} onClose={() => setMergeOpen(false)} onApply={(next) => (apply(next, 'Columns merged'), setMergeOpen(false))} />
    </div>
  );
}

function ColumnDialog({ open, col, table, stats, onClose, onApply }: { open: boolean; col: number | null; table: Table; stats: ReturnType<typeof columnStats> | null; onClose: () => void; onApply: (t: Table, msg?: string) => void }) {
  const [name, setName] = useState('');
  const [sep, setSep] = useState(' ');
  useEffect(() => {
    if (col !== null) setName(table.header[col]);
  }, [col, table.header]);
  if (col === null || !stats) return null;
  return (
    <Dialog open={open} onClose={onClose} title={`Column: ${table.header[col]}`} description={`${stats.filled} filled · ${stats.empty} empty · ${stats.unique} unique${stats.numeric ? ` · min ${stats.min} · max ${stats.max} · sum ${formatNumber(stats.sum ?? 0)}` : ''}`}>
      <div className="space-y-4">
        <div className="flex gap-2">
          <input aria-label="Column name" className="input" value={name} onChange={(e) => setName(e.target.value)} />
          <Button onClick={() => onApply(renameColumn(table, col, name.trim() || table.header[col]))}>Rename</Button>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button size="sm" onClick={() => onApply({ ...table, rows: sortRows(table.rows, col, 'asc') })}>
            Sort A → Z / 1 → 9
          </Button>
          <Button size="sm" onClick={() => onApply({ ...table, rows: sortRows(table.rows, col, 'desc') })}>
            Sort Z → A / 9 → 1
          </Button>
          <Button size="sm" onClick={() => onApply(caseColumn(table, col, 'upper'))}>UPPER</Button>
          <Button size="sm" onClick={() => onApply(caseColumn(table, col, 'lower'))}>lower</Button>
          <Button size="sm" onClick={() => onApply(caseColumn(table, col, 'title'))}>Title Case</Button>
          <Button
            size="sm"
            onClick={() => {
              const r = removeDuplicateRows(table.rows, { columns: [col], trim: true });
              onApply({ ...table, rows: r.rows }, r.removed ? `Removed ${r.removed} rows with a repeated value` : undefined);
            }}
          >
            Remove duplicate values
          </Button>
        </div>
        <div className="flex flex-wrap items-end gap-2">
          <div>
            <label htmlFor="split-sep" className="label">
              Split at
            </label>
            <input id="split-sep" className="input w-28 font-mono" value={sep} onChange={(e) => setSep(e.target.value)} placeholder="space" />
          </div>
          <Button icon={<Columns3 size={14} />} disabled={!sep} onClick={() => onApply(splitColumn(table, col, sep), 'Column split')}>
            Split column
          </Button>
          <span className="text-xs text-muted">e.g. a space splits “Asha Rao” into two columns</span>
        </div>
        <Button variant="danger" icon={<Trash2 size={14} />} disabled={table.header.length <= 1} onClick={() => onApply(deleteColumn(table, col), 'Column deleted')}>
          Delete column
        </Button>
      </div>
    </Dialog>
  );
}

function MergeDialog({ open, table, onClose, onApply }: { open: boolean; table: Table; onClose: () => void; onApply: (t: Table) => void }) {
  const [cols, setCols] = useState<number[]>([]);
  const [sep, setSep] = useState(' ');
  const [name, setName] = useState('');
  return (
    <Dialog
      open={open}
      onClose={onClose}
      title="Merge columns"
      description="Combine two or more columns into one, in the order you tick them."
      footer={
        <>
          <Button onClick={onClose}>Cancel</Button>
          <Button variant="primary" disabled={cols.length < 2} onClick={() => (onApply(mergeColumns({ ...table }, cols, sep, name.trim() || undefined)), setCols([]))}>
            Merge {cols.length || ''} columns
          </Button>
        </>
      }
    >
      <div className="space-y-3">
        <div className="max-h-56 space-y-1 overflow-auto">
          {table.header.map((h, i) => (
            <label key={i} className="flex cursor-pointer items-center gap-2 rounded px-2 py-1.5 text-sm hover:bg-surface2">
              <input type="checkbox" checked={cols.includes(i)} onChange={(e) => setCols(e.target.checked ? [...cols, i] : cols.filter((c) => c !== i))} />
              {h}
              {cols.includes(i) && <span className="ml-auto text-xs text-muted">#{cols.indexOf(i) + 1}</span>}
            </label>
          ))}
        </div>
        <div className="grid grid-cols-2 gap-2">
          <div>
            <label htmlFor="merge-sep" className="label">
              Separator
            </label>
            <input id="merge-sep" className="input font-mono" value={sep} onChange={(e) => setSep(e.target.value)} />
          </div>
          <div>
            <label htmlFor="merge-name" className="label">
              New column name
            </label>
            <input id="merge-name" className="input" value={name} onChange={(e) => setName(e.target.value)} placeholder="Automatic" />
          </div>
        </div>
      </div>
    </Dialog>
  );
}
