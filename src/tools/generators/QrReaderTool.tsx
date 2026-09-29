import { useCallback, useEffect, useRef, useState } from 'react';
import { Camera, CameraOff, AlertTriangle, ExternalLink, ShieldCheck } from 'lucide-react';
import type { ToolDefinition } from '@/types/tool';
import { acceptAttribute, formatLabel } from '@/tools/registry';
import { Button, Card, Badge } from '@/components/ui/primitives';
import { FileDropzone } from '@/components/files/FileDropzone';
import { CopyButton, InfoTable } from '@/components/tools/common';
import { useInitialFiles } from '@/hooks/useInitialFiles';
import { useStore } from '@/storage/store';
import { parseQr } from './payload';
import { decodeImageFile, decodeCanvas, drawScaled } from './raster';

interface Found {
  id: string;
  source: string;
  text: string;
  format: string;
}

const FORMAT_NAMES: Record<string, string> = { qr_code: 'QR code', ean_13: 'EAN-13', ean_8: 'EAN-8', upc_a: 'UPC-A', upc_e: 'UPC-E', code_128: 'Code 128', code_39: 'Code 39', itf: 'ITF', codabar: 'Codabar', data_matrix: 'Data Matrix', pdf417: 'PDF417', aztec: 'Aztec' };

function ResultCard({ r }: { r: Found }) {
  const p = parseQr(r.text);
  const [confirm, setConfirm] = useState(false);
  return (
    <Card className="space-y-3 p-4">
      <div className="flex flex-wrap items-center gap-2">
        <Badge tone="accent">{p.label}</Badge>
        <span className="text-xs text-muted">
          {FORMAT_NAMES[r.format] ?? r.format} · from {r.source}
        </span>
      </div>
      <InfoTable rows={p.fields.map(([k, v]) => [k, <span className="break-all">{v}</span>])} />
      {p.warnings.length > 0 ? (
        <ul className="space-y-1">
          {p.warnings.map((w) => (
            <li key={w} className="flex gap-2 text-sm text-warning">
              <AlertTriangle size={16} className="mt-0.5 shrink-0" /> {w}
            </li>
          ))}
        </ul>
      ) : (
        p.kind === 'url' && (
          <p className="flex gap-2 text-sm text-success">
            <ShieldCheck size={16} className="mt-0.5 shrink-0" /> No obvious warning signs. Still check that the domain is the one you expect.
          </p>
        )
      )}
      <div className="flex flex-wrap gap-2">
        <CopyButton text={r.text} label="Copy content" />
        {p.href &&
          (confirm ? (
            <a href={p.href} target="_blank" rel="noopener noreferrer nofollow" className="inline-flex h-8 items-center gap-1.5 rounded-md bg-accent px-2.5 text-[13px] font-medium text-accent-fg">
              <ExternalLink size={14} /> Yes, open {p.kind === 'url' ? new URL(p.href).hostname : 'it'}
            </a>
          ) : (
            <Button size="sm" icon={<ExternalLink size={14} />} onClick={() => setConfirm(true)}>
              Open…
            </Button>
          ))}
      </div>
    </Card>
  );
}

function CameraScanner({ onResult }: { onResult: (text: string) => void }) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [error, setError] = useState('');
  const [running, setRunning] = useState(false);
  const streamRef = useRef<MediaStream | null>(null);

  const stop = useCallback(() => {
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    setRunning(false);
  }, []);

  useEffect(() => stop, [stop]);

  useEffect(() => {
    if (!running) return;
    const canvas = document.createElement('canvas');
    let timer = 0;
    const tick = () => {
      const v = videoRef.current;
      if (v && v.readyState >= 2 && v.videoWidth) {
        const text = decodeCanvas(drawScaled(v, v.videoWidth, v.videoHeight, 720, canvas));
        if (text) {
          navigator.vibrate?.(60);
          onResult(text);
          stop();
          return;
        }
      }
      timer = window.setTimeout(tick, 180);
    };
    tick();
    return () => clearTimeout(timer);
  }, [running, onResult, stop]);

  const start = async () => {
    setError('');
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: { ideal: 'environment' }, width: { ideal: 1280 } }, audio: false });
      streamRef.current = stream;
      const v = videoRef.current!;
      v.srcObject = stream;
      await v.play();
      setRunning(true);
    } catch (err) {
      const name = (err as DOMException).name;
      setError(name === 'NotAllowedError' ? 'Camera permission was denied. Allow it in your browser’s site settings, or scan an image instead.' : name === 'NotFoundError' ? 'No camera was found on this device.' : 'The camera could not be started. Another app may be using it.');
      stop();
    }
  };

  const supported = !!navigator.mediaDevices?.getUserMedia;
  return (
    <Card className="space-y-3 p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-sm font-semibold">Scan with camera</h2>
        {running ? (
          <Button size="sm" icon={<CameraOff size={14} />} onClick={stop}>
            Stop camera
          </Button>
        ) : (
          <Button size="sm" variant="primary" icon={<Camera size={14} />} onClick={start} disabled={!supported}>
            Start camera
          </Button>
        )}
      </div>
      <div className={running ? 'relative overflow-hidden rounded-lg bg-black' : 'hidden'}>
        <video ref={videoRef} playsInline muted className="mx-auto max-h-[60vh] w-full object-contain" />
        <div aria-hidden className="pointer-events-none absolute inset-[18%] rounded-xl border-2 border-white/80 shadow-[0_0_0_9999px_rgba(0,0,0,0.35)]" />
      </div>
      {error && <p className="text-sm text-error">{error}</p>}
      {!supported && <p className="text-sm text-muted">This browser does not offer camera access. Scan an image instead.</p>}
      <p className="text-xs text-muted">Video is analysed frame by frame inside this page. Nothing is recorded or uploaded.</p>
    </Card>
  );
}

export default function QrReaderTool({ tool, initialFiles }: { tool: ToolDefinition; initialFiles?: File[] }) {
  const [results, setResults] = useState<Found[]>([]);
  const [misses, setMisses] = useState<string[]>([]);
  const addHistory = useStore((s) => s.addHistory);

  const push = useCallback((items: Omit<Found, 'id'>[]) => {
    setResults((r) => [...items.map((x) => ({ ...x, id: crypto.randomUUID?.() ?? String(Math.random()) })), ...r]);
    if (items.length) addHistory('qr-reader', `Read ${items.length} code${items.length > 1 ? 's' : ''}`);
  }, [addHistory]);

  const addFiles = useCallback(
    async (files: File[]) => {
      const miss: string[] = [];
      for (const f of files) {
        try {
          const found = await decodeImageFile(f);
          if (found.length) push(found.map((x) => ({ ...x, source: f.name })));
          else miss.push(f.name);
        } catch {
          miss.push(f.name);
        }
      }
      setMisses(miss);
    },
    [push],
  );
  useInitialFiles(initialFiles, addFiles);

  const onCamera = useCallback((text: string) => push([{ text, format: 'qr_code', source: 'camera' }]), [push]);

  return (
    <div className="space-y-4">
      <div className="grid gap-4 lg:grid-cols-2">
        <FileDropzone onFiles={addFiles} accept={acceptAttribute(tool)} acceptLabel={formatLabel(tool.inputTypes)} />
        <CameraScanner onResult={onCamera} />
      </div>
      {misses.length > 0 && (
        <p className="text-sm text-warning">
          No code found in {misses.join(', ')}. Try a sharper, closer image with the whole code visible.
        </p>
      )}
      {results.length > 0 && (
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-semibold">Results</h2>
            <Button size="sm" variant="ghost" onClick={() => setResults([])}>
              Clear
            </Button>
          </div>
          {results.map((r) => (
            <ResultCard key={r.id} r={r} />
          ))}
        </div>
      )}
      <p className="text-xs text-muted">Links are never opened automatically. Check the domain before you open a link or pay — fake QR stickers are a common scam.</p>
    </div>
  );
}
