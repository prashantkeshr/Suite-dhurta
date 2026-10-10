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
import { readMp4Dates, setMp4Dates } from '@/tools/media/mp4meta';
import { readMp3Tags, setMp3Tags, type Mp3Tags } from '@/tools/media/mp3meta';
import { readOfficeMeta, setOfficeMeta, type OfficeMeta } from '@/tools/media/officeMeta';

type Kind = 'jpeg' | 'png' | 'pdf' | 'mp4' | 'mp3' | 'office' | 'other';

function detectKind(file: File, head: Uint8Array): Kind {
  const ext = (file.name.split('.').pop() ?? '').toLowerCase();
  const at4 = String.fromCharCode(head[4] || 0, head[5] || 0, head[6] || 0, head[7] || 0);
  if (head[0] === 0xff && head[1] === 0xd8) return 'jpeg';
  if (head[0] === 0x89 && head[1] === 0x50) return 'png';
  if ((head[0] === 0x25 && head[1] === 0x50 && head[2] === 0x44 && head[3] === 0x46) || ext === 'pdf') return 'pdf';
  if (at4 === 'ftyp' || ['mp4', 'm4v', 'mov'].includes(ext)) return 'mp4';
  if ((head[0] === 0x49 && head[1] === 0x44 && head[2] === 0x33) || ext === 'mp3' || (head[0] === 0xff && (head[1] & 0xe0) === 0xe0)) return 'mp3';
  if (head[0] === 0x50 && head[1] === 0x4b && ['docx', 'xlsx', 'pptx'].includes(ext)) return 'office';
  return 'other';
}

/* ISO datetime <-> datetime-local (minutes). */
const isoToLocal = (s?: string) => {
  if (!s) return '';
  const d = new Date(s);
  if (isNaN(d.getTime())) return '';
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
};
const localToDate = (s: string) => (s ? new Date(s) : undefined);

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

/* ---------- MP4 / MOV editor ---------- */

function Mp4Editor({ file, onDone }: { file: File; onDone: (r: { blob: Blob; name: string }) => void }) {
  const [created, setCreated] = useState('');
  const [modified, setModified] = useState('');
  const [editable, setEditable] = useState<boolean | null>(null);
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    let alive = true;
    void file.arrayBuffer().then((b) => {
      const d = readMp4Dates(new Uint8Array(b));
      if (!alive) return;
      setEditable(d.editable);
      setCreated(isoToLocal(d.created?.toISOString()));
      setModified(isoToLocal(d.modified?.toISOString()));
    });
    return () => { alive = false; };
  }, [file]);
  const apply = async () => {
    setBusy(true);
    try {
      const bytes = new Uint8Array(await file.arrayBuffer());
      const out = setMp4Dates(bytes, { created: localToDate(created), modified: localToDate(modified) });
      onDone({ blob: new Blob([out as BlobPart], { type: file.type || 'video/mp4' }), name: outputName(file.name, 'edited', file.name.split('.').pop() || 'mp4') });
    } catch {
      toast.error('Could not write the video dates.');
    } finally {
      setBusy(false);
    }
  };
  if (editable === null) return <Card className="p-4 text-sm text-muted">Reading video...</Card>;
  if (!editable) return <Card className="p-4 text-sm text-muted">This video has no editable date atoms.</Card>;
  return (
    <Card className="space-y-3 p-4">
      <h2 className="text-sm font-semibold">Edit video dates</h2>
      <div className="grid gap-3 sm:grid-cols-2">
        <Row label="Media created"><input type="datetime-local" className="input" value={created} onChange={(e) => setCreated(e.target.value)} /></Row>
        <Row label="Media modified"><input type="datetime-local" className="input" value={modified} onChange={(e) => setModified(e.target.value)} /></Row>
      </div>
      <Button variant="primary" icon={<Save size={16} />} loading={busy} onClick={apply}>Save changes to a new video</Button>
      <p className="text-xs text-muted">Changes the media created/modified dates stored inside the file (mvhd/tkhd/mdhd). The video is not re-encoded. The operating-system file date cannot be set from a browser.</p>
    </Card>
  );
}

/* ---------- MP3 editor ---------- */

function Mp3Editor({ file, onDone }: { file: File; onDone: (r: { blob: Blob; name: string }) => void }) {
  const [tags, setTags] = useState<Mp3Tags | null>(null);
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    let alive = true;
    void file.arrayBuffer().then((b) => alive && setTags(readMp3Tags(new Uint8Array(b)).tags));
    return () => { alive = false; };
  }, [file]);
  const apply = async () => {
    if (!tags) return;
    setBusy(true);
    try {
      const bytes = new Uint8Array(await file.arrayBuffer());
      onDone({ blob: new Blob([setMp3Tags(bytes, tags) as BlobPart], { type: 'audio/mpeg' }), name: outputName(file.name, 'edited', 'mp3') });
    } catch {
      toast.error('Could not write the tags.');
    } finally {
      setBusy(false);
    }
  };
  if (!tags) return <Card className="p-4 text-sm text-muted">Reading audio...</Card>;
  const F = (label: string, key: keyof Mp3Tags) => (
    <Row label={label}><input className="input" value={tags[key]} onChange={(e) => setTags({ ...tags, [key]: e.target.value })} /></Row>
  );
  return (
    <Card className="space-y-3 p-4">
      <h2 className="text-sm font-semibold">Edit song tags (ID3)</h2>
      <div className="grid gap-3 sm:grid-cols-2">
        {F('Title', 'title')}
        {F('Artist', 'artist')}
        {F('Album', 'album')}
        {F('Year', 'year')}
        {F('Track no.', 'track')}
        {F('Genre', 'genre')}
      </div>
      {F('Comment', 'comment')}
      <Button variant="primary" icon={<Save size={16} />} loading={busy} onClick={apply}>Save changes to a new MP3</Button>
      <p className="text-xs text-muted">Writes a standard ID3v2.4 tag. The audio is untouched.</p>
    </Card>
  );
}

/* ---------- Office editor ---------- */

function OfficeEditor({ file, onDone }: { file: File; onDone: (r: { blob: Blob; name: string }) => void }) {
  const [meta, setMeta] = useState<OfficeMeta | null>(null);
  const [editable, setEditable] = useState<boolean | null>(null);
  const [busy, setBusy] = useState(false);
  const [created, setCreated] = useState('');
  const [modified, setModified] = useState('');
  useEffect(() => {
    let alive = true;
    void file.arrayBuffer().then((b) => {
      const r = readOfficeMeta(new Uint8Array(b));
      if (!alive) return;
      setEditable(r.editable);
      setMeta(r.meta);
      setCreated(isoToLocal(r.meta.created));
      setModified(isoToLocal(r.meta.modified));
    });
    return () => { alive = false; };
  }, [file]);
  const apply = async () => {
    if (!meta) return;
    setBusy(true);
    try {
      const bytes = new Uint8Array(await file.arrayBuffer());
      const iso = (local: string) => (local ? new Date(local).toISOString().replace(/\.\d{3}Z$/, 'Z') : '');
      const out = setOfficeMeta(bytes, { ...meta, created: iso(created), modified: iso(modified) });
      onDone({ blob: new Blob([out as BlobPart], { type: file.type }), name: outputName(file.name, 'edited', file.name.split('.').pop() || 'docx') });
    } catch {
      toast.error('Could not save the document.');
    } finally {
      setBusy(false);
    }
  };
  if (editable === null) return <Card className="p-4 text-sm text-muted">Reading document...</Card>;
  if (!editable || !meta) return <Card className="p-4 text-sm text-muted">This file has no editable core properties.</Card>;
  const f = (k: keyof OfficeMeta) => (e: React.ChangeEvent<HTMLInputElement>) => setMeta({ ...meta, [k]: e.target.value });
  return (
    <Card className="space-y-3 p-4">
      <h2 className="text-sm font-semibold">Edit document properties</h2>
      <div className="grid gap-3 sm:grid-cols-2">
        <Row label="Title"><input className="input" value={meta.title} onChange={f('title')} /></Row>
        <Row label="Author"><input className="input" value={meta.author} onChange={f('author')} /></Row>
        <Row label="Subject"><input className="input" value={meta.subject} onChange={f('subject')} /></Row>
        <Row label="Keywords"><input className="input" value={meta.keywords} onChange={f('keywords')} /></Row>
        <Row label="Created date"><input type="datetime-local" className="input" value={created} onChange={(e) => setCreated(e.target.value)} /></Row>
        <Row label="Modified date"><input type="datetime-local" className="input" value={modified} onChange={(e) => setModified(e.target.value)} /></Row>
      </div>
      <Button variant="primary" icon={<Save size={16} />} loading={busy} onClick={apply}>Save properties</Button>
      <p className="text-xs text-muted">Edits the created/modified dates stored inside the .docx/.xlsx/.pptx. The operating-system file date cannot be set from a browser.</p>
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
      <FileDropzone onFiles={open} multiple={false} acceptLabel="a photo, PDF, video (MP4), MP3 or Office file" compact={!!file} />
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
            {kind === 'mp4' && <Mp4Editor file={file} onDone={setResult} />}
            {kind === 'mp3' && <Mp3Editor file={file} onDone={setResult} />}
            {kind === 'office' && <OfficeEditor file={file} onDone={setResult} />}
            {kind === 'other' && (
              <Card className="p-4">
                <p className="flex items-center gap-2 text-sm text-muted"><Info size={16} /> Editing metadata for this file type isn’t supported yet. Supported: JPEG/PNG photos, PDF, MP4/MOV video, MP3 audio, and Office files (.docx/.xlsx/.pptx).</p>
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
