import { useCallback, useMemo, useState } from 'react';
import { clsx } from 'clsx';
import { Download, X } from 'lucide-react';
import type { ToolDefinition } from '@/types/tool';
import { acceptAttribute, formatLabel } from '@/tools/registry';
import { useInitialFiles } from '@/hooks/useInitialFiles';
import { useStore } from '@/storage/store';
import { saveMany } from '@/conversion/download';
import { formatBytes, formatNumber } from '@/utils/format';
import { sanitizeFilename } from '@/utils/filename';
import { UserError } from '@/utils/errors';
import { Button, Card, Progress, Toggle } from '@/components/ui/primitives';
import { ErrorState } from '@/components/ui/states';
import { FileDropzone } from '@/components/files/FileDropzone';
import { DataGrid } from '@/components/data/DataGrid';
import { InfoTable, useSaver } from '@/components/tools/common';
import { rowsToCsv } from './csv';
import { fromRows, tableToObjects } from './table';

interface Sheet {
  name: string;
  rows: string[][];
  hidden: boolean;
}
interface Book {
  file: File;
  sheets: Sheet[];
  props: [string, string][];
}

const MAX_CELLS = 5_000_000;

export default function SpreadsheetTool({ tool, initialFiles }: { tool: ToolDefinition; initialFiles?: File[] }) {
  const [book, setBook] = useState<Book | null>(null);
  const [active, setActive] = useState(0);
  const [hasHeader, setHasHeader] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<unknown>(null);
  const save = useSaver();
  const useDialog = useStore((s) => s.settings.useSaveDialog);
  const addHistory = useStore((s) => s.addHistory);

  const open = useCallback(
    async (files: File[]) => {
      const file = files[0];
      setBusy(true);
      setError(null);
      try {
        const XLSX = await import('xlsx');
        const data = new Uint8Array(await file.arrayBuffer());
        let wb;
        try {
          // Formulas and HTML are not needed for viewing; values are read as displayed text.
          wb = XLSX.read(data, { type: 'array', dense: true, cellFormula: false, cellHTML: false, cellDates: true });
        } catch (err) {
          const msg = String((err as Error)?.message ?? err);
          if (/password|encrypt/i.test(msg)) throw new UserError(`“${file.name}” is password-protected.`, ['The workbook is encrypted'], ['Open it in Excel with your password, save an unprotected copy, then try again'], err);
          throw new UserError(`“${file.name}” could not be read as a spreadsheet.`, ['The file may be damaged or in an unsupported format'], ['Re-save it as .xlsx or .csv and try again'], err);
        }
        const sheets: Sheet[] = wb.SheetNames.map((name, i) => {
          const ws = wb.Sheets[name];
          const rows = XLSX.utils.sheet_to_json<string[]>(ws, { header: 1, raw: false, defval: '', blankrows: false }).map((r) => r.map((v) => String(v ?? '')));
          const cells = rows.reduce((a, r) => a + r.length, 0);
          if (cells > MAX_CELLS) throw new UserError(`Sheet “${name}” is too large to show here (${formatNumber(cells)} cells).`, [], ['Export it to CSV in Excel and use the CSV editor']);
          return { name, rows, hidden: !!wb.Workbook?.Sheets?.[i]?.Hidden };
        });
        const p = (wb.Props ?? {}) as Record<string, unknown>;
        const fmt = (v: unknown) => (v instanceof Date ? v.toLocaleString() : v ? String(v) : '—');
        setBook({
          file,
          sheets,
          props: [
            ['Sheets', String(sheets.length)],
            ['Title', fmt(p.Title)],
            ['Author', fmt(p.Author)],
            ['Last modified by', fmt(p.LastAuthor)],
            ['Created', fmt(p.CreatedDate)],
            ['Modified', fmt(p.ModifiedDate)],
            ['Application', fmt(p.Application)],
            ['File size', formatBytes(file.size)],
          ],
        });
        setActive(sheets.findIndex((s) => !s.hidden) >= 0 ? sheets.findIndex((s) => !s.hidden) : 0);
        addHistory(tool.id, `Opened ${file.name} (${sheets.length} sheet${sheets.length > 1 ? 's' : ''})`);
      } catch (err) {
        setBook(null);
        setError(err);
      } finally {
        setBusy(false);
      }
    },
    [addHistory, tool.id],
  );
  useInitialFiles(initialFiles, open);

  const sheet = book?.sheets[active];
  const table = useMemo(() => (sheet && sheet.rows.length ? fromRows(sheet.rows, hasHeader) : null), [sheet, hasHeader]);
  const base = book ? book.file.name.replace(/\.[^.]+$/, '') : 'sheet';

  const exportAll = async () => {
    if (!book) return;
    const files = book.sheets.filter((s) => s.rows.length).map((s) => {
      const t = fromRows(s.rows, false);
      return { name: sanitizeFilename(`${base} - ${s.name}.csv`), blob: new Blob(['﻿' + rowsToCsv(t.rows[0] ?? [], t.rows.slice(1))], { type: 'text/csv' }) };
    });
    await saveMany(files, `${base}-sheets.zip`, { useDialog });
  };

  return (
    <div className="space-y-3">
      {!book && !busy && <FileDropzone onFiles={open} accept={acceptAttribute(tool)} acceptLabel={formatLabel(tool.inputTypes)} multiple={false} />}
      {busy && <Progress value={null} label="Reading workbook" />}
      {error != null && <ErrorState error={error} />}
      {book && (
        <>
          <Card className="flex flex-wrap items-center gap-3 p-3">
            <p className="min-w-0 flex-1 truncate text-sm font-medium">{book.file.name}</p>
            <Toggle checked={hasHeader} onChange={setHasHeader} label="First row is a header" />
            <Button size="sm" variant="ghost" icon={<X size={14} />} onClick={() => setBook(null)}>
              Close
            </Button>
          </Card>
          <div role="tablist" aria-label="Sheets" className="no-scrollbar flex gap-1 overflow-x-auto border-b border-line">
            {book.sheets.map((s, i) => (
              <button key={i} role="tab" aria-selected={i === active} onClick={() => setActive(i)} className={clsx('-mb-px whitespace-nowrap border-b-2 px-3 py-2 text-sm', i === active ? 'border-accent font-medium text-fg' : 'border-transparent text-muted hover:text-fg')}>
                {s.name}
                {s.hidden && <span className="ml-1 text-xs text-muted">(hidden)</span>}
              </button>
            ))}
          </div>
          {table ? (
            <>
              <p className="text-xs text-muted">
                {formatNumber(table.rows.length)} rows · {table.header.length} columns. Values are shown as Excel displays them; formulas show their last calculated result.
              </p>
              <DataGrid label={`Sheet ${sheet!.name}`} header={table.header} rows={table.rows} height={Math.min(520, 40 + table.rows.length * 34)} />
              <div className="flex flex-wrap gap-2">
                <Button variant="primary" icon={<Download size={16} />} onClick={() => save(new Blob(['﻿' + rowsToCsv(table.header, table.rows)], { type: 'text/csv;charset=utf-8' }), sanitizeFilename(`${base} - ${sheet!.name}.csv`))}>
                  Sheet as CSV
                </Button>
                <Button icon={<Download size={16} />} onClick={() => save(new Blob([JSON.stringify(tableToObjects(table), null, 2)], { type: 'application/json' }), sanitizeFilename(`${base} - ${sheet!.name}.json`))}>
                  Sheet as JSON
                </Button>
                {book.sheets.length > 1 && (
                  <Button icon={<Download size={16} />} onClick={exportAll}>
                    All sheets (ZIP of CSVs)
                  </Button>
                )}
              </div>
            </>
          ) : (
            <p className="py-6 text-center text-sm text-muted">This sheet is empty.</p>
          )}
          <Card className="p-4">
            <h2 className="section-title">Workbook properties</h2>
            <InfoTable rows={book.props} />
          </Card>
        </>
      )}
      <p className="text-xs text-muted">Charts, images, formatting and macros are not shown. Macros are never run.</p>
    </div>
  );
}
