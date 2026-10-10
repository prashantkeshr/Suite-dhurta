import { useCallback, useEffect, useState } from 'react';
import { Save, Eraser, Download, MapPin, ExternalLink, ShieldAlert, ShieldCheck, Info } from 'lucide-react';
import type { ToolDefinition } from '@/types/tool';
import { Button, Card, Badge } from '@/components/ui/primitives';
import { FileDropzone } from '@/components/files/FileDropzone';
import { InfoTable, CopyButton, useSaver, ContinueButton } from '@/components/tools/common';
import { toast } from '@/components/ui/Toast';
import { useInitialFiles } from '@/hooks/useInitialFiles';
import { useObjectUrl } from '@/hooks/useObjectUrl';
import { formatBytes } from '@/utils/format';
import { outputName } from '@/utils/filename';
import { readMetadata, stripMetadata, writePngText, type ImageMetadata } from './metadata';
import { writeJpegExif, editableFromMeta, type EditableExif } from './exifWrite';
import { loadPdf, readInfo, setMetadata, stripMetadata as stripPdf, type EditableMeta } from '@/tools/pdf/engine';

type Kind = 'jpeg' | 'png' | 'pdf' | 'other';

function detectKind(file: File, head: Uint8Array): Kind {
  if (head[0] === 0xff && head[1] === 0xd8) return 'jpeg';
  if (head[0] === 0x89 && head[1] === 0x50) return 'png';
  if (head[0] === 0x25 && head[1] === 0x50 && head[2] === 0x44 && head[3] === 0x46) return 'pdf';
  if (/\.(pdf)$/i.test(file.name)) return 'pdf';
  return 'other';
}

/* ---------- date helpers (EXIF "YYYY:MM:DD HH:MM:SS" <-> datetime-local) ---------- */
const exifToLocal = (s?: string) => {
  const m = /^(\d{4}):(\d{2}):(\d{2})[ T](\d{2}):(\d{2})/.exec(s ?? '');
  return m ? `${m[1]}-${m[2]}-${m[3]}T${m[4]}:${m[5]}` : '';
};
const localToExif = (s: string) => {
  const m = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})/.exec(s);
  return m ? `${m[1]}:${m[2]}:${m[3]} ${m[4]}:${m[5]}:00` : '';
};

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="label">{label}</label>
      {children}
    </div>
  );
}

/* ---------- JPEG editor ---------- */

function JpegEditor({ file, meta, onDone }: { file: File; meta: ImageMetadata; onDone: (r: { blob: Blob; name: string }) => void }) {
  const init = editableFromMeta(meta);
  const [ex, setEx] = useState<EditableExif>(init);
  const [dt, setDt] = useState(exifToLocal(init.dateTaken));
  const [gpsOn, setGpsOn] = useState(!!init.gps);
  const [lat, setLat] = useState(init.gps ? String(init.gps.lat) : '');
  const [lon, setLon] = useState(init.gps ? String(init.gps.lon) : '');
  const [busy, setBusy] = useState(false);
  const set = (p: Partial<EditableExif>) => setEx({ ...ex, ...p });

  const apply = async () => {
    setBusy(true);
    try {
      const bytes = new Uint8Array(await file.arrayBuffer());
      const edited: EditableExif = { ...ex, dateTaken: dt ? localToExif(dt) : undefined, gps: gpsOn && lat && lon ? { lat: Number(lat), lon: Number(lon) } : null };
      onDone({ blob: new Blob([writeJpegExif(bytes, edited) as BlobPart], { type: 'image/jpeg' }), name: outputName(file.name, 'edited', 'image/jpeg') });
    } catch {
      toast.error('Could not write the metadata.');
    } finally {
      setBusy(false);
    }
  };

  const F = (label: string, key: keyof EditableExif, placeholder?: string) => (
    <Row label={label}>
      <input className="input" value={(ex[key] as string) ?? ''} placeholder={placeholder} onChange={(e) => set({ [key]: e.target.value } as Partial<EditableExif>)} />
    </Row>
  );

  return (
    <Card className="space-y-3 p-4">
      <h2 className="text-sm font-semibold">Edit photo details (EXIF)</h2>
      <Row label="Date &amp; time taken">
        <input type="datetime-local" className="input" value={dt} onChange={(e) => setDt(e.target.value)} />
      </Row>
      <div className="grid gap-3 sm:grid-cols-2">
        {F('Camera make', 'make', 'Canon')}
        {F('Camera model', 'model', 'EOS R5')}
        {F('Lens', 'lens')}
        {F('Artist / author', 'artist')}
        {F('Copyright', 'copyright')}
        {F('Software', 'software')}
      </div>
      {F('Description', 'description')}
      <div className="rounded-md border border-line p-3">
        <label className="flex items-center gap-2 text-sm font-medium">
          <input type="checkbox" className="h-4 w-4 accent-[rgb(var(--accent))]" checked={gpsOn} onChange={(e) => setGpsOn(e.target.checked)} /> GPS location
        </label>
        {gpsOn && (
          <div className="mt-2 grid grid-cols-2 gap-2">
            <input className="input tabular-nums" inputMode="decimal" placeholder="Latitude" value={lat} onChange={(e) => setLat(e.target.value.replace(/[^\d.-]/g, ''))} />
            <input className="input tabular-nums" inputMode="decimal" placeholder="Longitude" value={lon} onChange={(e) => setLon(e.target.value.replace(/[^\d.-]/g, ''))} />
          </div>
        )}
      </div>
      <Button variant="primary" icon={<Save size={16} />} loading={busy} onClick={apply}>
        Save changes to a new photo
      </Button>
      <p className="text-xs text-muted">Changes the date and details stored inside the photo. Your computer’s own “date modified” is set by Windows when the file is saved and cannot be changed from a browser.</p>
    </Card>
  );
}

/* ---------- PNG editor ---------- */

const PNG_KEYS = ['Title', 'Author', 'Description', 'Software', 'Copyright', 'Comment'];
function PngEditor({ file, meta, onDone }: { file: File; meta: ImageMetadata; onDone: (r: { blob: Blob; name: string }) => void }) {
  const initial = Object.fromEntries(PNG_KEYS.map((k) => [k, meta.fields.find((f) => f.tag === k)?.value ?? '']));
  const [fields, setFields] = useState<Record<string, string>>(initial);
  const [busy, setBusy] = useState(false);
  const apply = async () => {
    setBusy(true);
    try {
      const bytes = new Uint8Array(await file.arrayBuffer());
      onDone({ blob: new Blob([writePngText(bytes, fields) as BlobPart], { type: 'image/png' }), name: outputName(file.name, 'edited', 'image/png') });
    } catch {
      toast.error('Could not write the metadata.');
    } finally {
      setBusy(false);
    }
  };
  return (
    <Card className="space-y-3 p-4">
      <h2 className="text-sm font-semibold">Edit image details (PNG text)</h2>
      <div className="grid gap-3 sm:grid-cols-2">
        {PNG_KEYS.map((k) => (
          <Row key={k} label={k}>
            <input className="input" value={fields[k]} onChange={(e) => setFields({ ...fields, [k]: e.target.value })} />
          </Row>
        ))}
      </div>
      <Button variant="primary" icon={<Save size={16} />} loading={busy} onClick={apply}>
        Save changes to a new image
      </Button>
      <p className="text-xs text-muted">PNG stores text fields, not EXIF dates. The operating-system file date cannot be set from a browser.</p>
    </Card>
  );
}

/* ---------- PDF editor ---------- */

function PdfEditor({ file, onDone }: { file: File; onDone: (r: { blob: Blob; name: string }) => void }) {
  const [edit, setEdit] = useState<EditableMeta | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');

  useEffect(() => {
    let alive = true;
    void (async () => {
      try {
        const { doc } = await loadPdf(file);
        const i = readInfo(doc);
        const d = (x?: Date) => (x && !isNaN(x.getTime()) && x.getTime() > 0 ? x.toISOString().slice(0, 16) : '');
        if (alive) {
          setEdit({ title: i.title ?? '', author: i.author ?? '', subject: i.subject ?? '', keywords: i.keywords ?? '', creator: i.creator ?? '', created: d(i.created), modified: d(i.modified) });
        }
      } catch (e) {
        if (alive) setErr((e as Error).message || 'Could not open this PDF.');
      }
    })();
    return () => { alive = false; };
  }, [file]);

  const apply = async (strip: boolean) => {
    if (!edit && !strip) return;
    setBusy(true);
    try {
      const { doc } = await loadPdf(file);
      const blob = strip ? await stripPdf(doc) : await setMetadata(doc, edit!);
      onDone({ blob, name: outputName(file.name, strip ? 'clean' : 'edited', 'pdf') });
    } catch {
      toast.error('Could not save the PDF.');
    } finally {
      setBusy(false);
    }
  };

  if (err) return <Card className="p-4 text-sm text-error">{err}</Card>;
  if (!edit) return <Card className="p-4 text-sm text-muted">Reading PDF…</Card>;
  const f = (k: keyof EditableMeta) => (e: React.ChangeEvent<HTMLInputElement>) => setEdit({ ...edit, [k]: e.target.value });
  return (
    <Card className="space-y-3 p-4">
      <h2 className="text-sm font-semibold">Edit PDF properties</h2>
      <div className="grid gap-3 sm:grid-cols-2">
        <Row label="Title"><input className="input" value={edit.title} onChange={f('title')} /></Row>
        <Row label="Author"><input className="input" value={edit.author} onChange={f('author')} /></Row>
        <Row label="Subject"><input className="input" value={edit.subject} onChange={f('subject')} /></Row>
        <Row label="Keywords"><input className="input" value={edit.keywords} onChange={f('keywords')} /></Row>
        <Row label="Creator app"><input className="input" value={edit.creator} onChange={f('creator')} /></Row>
        <div />
        <Row label="Created date"><input type="datetime-local" className="input" value={edit.created ?? ''} onChange={f('created')} /></Row>
        <Row label="Modified date"><input type="datetime-local" className="input" value={edit.modified ?? ''} onChange={f('modified')} /></Row>
      </div>
      <div className="flex flex-wrap gap-2">
        <Button variant="primary" icon={<Save size={16} />} loading={busy} onClick={() => apply(false)}>
          Save properties
        </Button>
        <Button icon={<Eraser size={16} />} onClick={() => apply(true)}>
          Remove all metadata
        </Button>
      </div>
      <p className="text-xs text-muted">Changes the dates recorded inside the PDF. The operating-system file date is set by Windows on download and cannot be changed from a browser.</p>
    </Card>
  );
}

/* ---------- tool ---------- */

export default function MetadataEditorTool({ initialFiles }: { tool: ToolDefinition; initialFiles?: File[] }) {
  const [file, setFile] = useState<File | null>(null);
  const [kind, setKind] = useState<Kind>('other');
  const [meta, setMeta] = useState<ImageMetadata | null>(null);
  const [result, setResult] = useState<{ blob: Blob; name: string } | null>(null);
  const save = useSaver();
  const url = useObjectUrl(file && (kind === 'jpeg' || kind === 'png') ? file : null);

  const open = useCallback(async (files: File[]) => {
    const f = files[0];
    if (!f) return;
    setResult(null);
    const head = new Uint8Array(await f.slice(0, 8).arrayBuffer());
    const k = detectKind(f, head);
    setKind(k);
    setFile(f);
    setMeta(k === 'jpeg' || k === 'png' ? readMetadata(new Uint8Array(await f.arrayBuffer())) : null);
  }, []);
  useInitialFiles(initialFiles, open);

  const removeImage = async () => {
    if (!file) return;
    const bytes = new Uint8Array(await file.arrayBuffer());
    const cleaned = stripMetadata(bytes);
    const blob = cleaned ? new Blob([cleaned as BlobPart], { type: file.type }) : file;
    setResult({ blob, name: outputName(file.name, 'no-metadata', file.type) });
    toast.success('Metadata removed');
  };

  const sensitive = meta?.fields.filter((f) => f.sensitive) ?? [];

  return (
    <div className="space-y-4">
      <FileDropzone onFiles={open} multiple={false} acceptLabel="a photo (JPEG/PNG) or a PDF" compact={!!file} />
      {file && (
        <div className="grid gap-4 lg:grid-cols-[300px_1fr]">
          <div className="space-y-3">
            {url && <div className="checker flex aspect-square items-center justify-center overflow-hidden rounded-lg border border-line"><img src={url} alt="" className="max-h-full max-w-full object-contain" /></div>}
            <p className="truncate text-sm font-medium" title={file.name}>{file.name}</p>
            <p className="text-xs text-muted">{formatBytes(file.size)} · {kind.toUpperCase()}</p>
            {meta && (meta.gps ? (
              <a href={`https://www.openstreetmap.org/?mlat=${meta.gps.lat}&mlon=${meta.gps.lon}&zoom=15`} target="_blank" rel="noopener noreferrer nofollow" className="inline-flex items-center gap-1.5 text-sm text-accent hover:underline">
                <MapPin size={14} /> View location <ExternalLink size={12} />
              </a>
            ) : null)}
          </div>

          <div className="min-w-0 space-y-4">
            {meta && (meta.hasMetadata ? (
              <p className="flex items-center gap-2 text-sm text-warning"><ShieldAlert size={16} /> {meta.fields.length} metadata field{meta.fields.length > 1 ? 's' : ''} found{sensitive.length ? ` — ${sensitive.length} personal (${sensitive.map((f) => f.tag).join(', ')})` : ''}.</p>
            ) : (
              <p className="flex items-center gap-2 text-sm text-success"><ShieldCheck size={16} /> No metadata found. You can add some below.</p>
            ))}

            {kind === 'jpeg' && meta && <JpegEditor file={file} meta={meta} onDone={setResult} />}
            {kind === 'png' && meta && <PngEditor file={file} meta={meta} onDone={setResult} />}
            {kind === 'pdf' && <PdfEditor file={file} onDone={setResult} />}
            {kind === 'other' && (
              <Card className="p-4">
                <p className="flex items-center gap-2 text-sm text-muted"><Info size={16} /> Editing metadata for this file type isn’t supported yet. Supported: JPEG and PNG photos, and PDF. MP3, MP4 and Office files are coming.</p>
              </Card>
            )}

            {(kind === 'jpeg' || kind === 'png') && meta?.hasMetadata && (
              <Button variant="secondary" icon={<Eraser size={16} />} onClick={removeImage}>
                Remove all metadata instead
              </Button>
            )}

            {meta && meta.fields.length > 0 && (
              <Card className="p-4">
                <div className="mb-2 flex items-center justify-between">
                  <h2 className="text-sm font-semibold">Current metadata</h2>
                  <CopyButton text={meta.fields.map((f) => `${f.tag}: ${f.value}`).join('\n')} label="Copy" />
                </div>
                <InfoTable rows={meta.fields.map((f) => [f.tag, <span className={f.sensitive ? 'text-warning' : ''}>{f.value}{f.sensitive && <Badge tone="warning" className="ml-2">personal</Badge>}</span>])} />
              </Card>
            )}

            {result && (
              <Card className="space-y-2 border-success/30 p-3">
                <p className="text-sm font-medium text-success">Ready · {formatBytes(result.blob.size)}</p>
                <div className="flex flex-wrap gap-2">
                  <Button variant="primary" icon={<Download size={16} />} onClick={() => save(result.blob, result.name)}>
                    Download {result.name.length > 24 ? result.name.slice(0, 22) + '…' : result.name}
                  </Button>
                  <ContinueButton size="md" files={[result]} />
                </div>
              </Card>
            )}
          </div>
        </div>
      )}
      <p className="text-xs text-muted">Everything happens in your browser — files are never uploaded.</p>
    </div>
  );
}
