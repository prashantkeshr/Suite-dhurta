import { useCallback, useEffect, useRef, useState } from 'react';
import { clsx } from 'clsx';
import { Download, ExternalLink, FolderOpen, Maximize, Maximize2, Minimize2, ShieldAlert, X } from 'lucide-react';
import type { ToolDefinition } from '@/types/tool';
import { useStore } from '@/storage/store';
import { APP } from '@/app/config';
import { formatBytes } from '@/utils/format';
import { outputName } from '@/utils/filename';
import { Button, Card, Toggle } from '@/components/ui/primitives';
import { toast } from '@/components/ui/Toast';
import { useSaver } from '@/components/tools/common';

/**
 * Photopea (https://www.photopea.com) embedded as an external editor.
 * Communication uses Photopea's documented postMessage API:
 *   - send an ArrayBuffer to open a file, or a string to run a script
 *   - Photopea replies "done" when ready and after each message,
 *     and an ArrayBuffer for app.activeDocument.saveToOE(format)
 */
const ORIGIN = 'https://www.photopea.com';
// Photopea only enables its postMessage API (the "done" handshake) when started
// with a JSON config in the URL hash; a plain URL never answers.
const SRC = `${ORIGIN}#${encodeURIComponent(JSON.stringify({ environment: {} }))}`;
const SITE = `${ORIGIN}/`;
const MAX_OPEN_BYTES = 300 * 1024 * 1024;

type Size = 'fit' | 'window' | 'fullscreen';
type ExportFormat = { id: string; label: string; script: string; mime: string; ext: string };

const EXPORTS: ExportFormat[] = [
  { id: 'png', label: 'PNG', script: 'png', mime: 'image/png', ext: 'png' },
  { id: 'jpg', label: 'JPG', script: 'jpg:0.9', mime: 'image/jpeg', ext: 'jpg' },
  { id: 'webp', label: 'WebP', script: 'webp:0.9', mime: 'image/webp', ext: 'webp' },
  { id: 'psd', label: 'PSD', script: 'psd', mime: 'image/vnd.adobe.photoshop', ext: 'psd' },
];

const canFullscreen = () => typeof document !== 'undefined' && !!document.documentElement.requestFullscreen && document.fullscreenEnabled !== false;

export default function PhotopeaTool({ tool, initialFiles }: { tool: ToolDefinition; initialFiles?: File[] }) {
  const autoLoad = useStore((s) => s.settings.photopeaAutoLoad);
  const updateSettings = useStore((s) => s.updateSettings);
  const addHistory = useStore((s) => s.addHistory);
  const save = useSaver();

  const [started, setStarted] = useState(autoLoad);
  const [remember, setRemember] = useState(false);
  const [ready, setReady] = useState(false);
  const [size, setSize] = useState<Size>('fit');
  const [busy, setBusy] = useState<string | null>(null);
  const [docName, setDocName] = useState('image');
  const frameRef = useRef<HTMLIFrameElement>(null);
  const shellRef = useRef<HTMLDivElement>(null);
  const fileInput = useRef<HTMLInputElement>(null);
  // Files handed over from the home page are opened once Photopea is ready.
  const queue = useRef<File[]>(initialFiles ?? []);
  const pendingExport = useRef<ExportFormat | null>(null);

  // Settings load asynchronously; honour a saved "load automatically" choice when it arrives.
  useEffect(() => {
    if (autoLoad) setStarted(true);
  }, [autoLoad]);

  const post = useCallback((msg: string | ArrayBuffer) => {
    const w = frameRef.current?.contentWindow;
    if (!w) return false;
    // Always target Photopea's exact origin, never "*".
    if (msg instanceof ArrayBuffer) w.postMessage(msg, ORIGIN, [msg]);
    else w.postMessage(msg, ORIGIN);
    return true;
  }, []);

  const openFiles = useCallback(
    async (files: File[]) => {
      if (!ready) {
        queue.current.push(...files);
        return;
      }
      for (const f of files) {
        if (f.size > MAX_OPEN_BYTES) {
          toast.error(`${f.name} is too large`, `Files up to ${formatBytes(MAX_OPEN_BYTES)} can be opened here.`);
          continue;
        }
        setBusy(`Opening ${f.name}…`);
        setDocName(f.name.replace(/\.[^.]+$/, '') || 'image');
        post(await f.arrayBuffer());
        addHistory(tool.id, `Opened ${f.name} in Photopea`);
      }
    },
    [ready, post, addHistory, tool.id],
  );

  // Listen only to messages from the Photopea frame.
  useEffect(() => {
    const onMessage = (e: MessageEvent) => {
      if (e.origin !== ORIGIN || e.source !== frameRef.current?.contentWindow) return;
      if (e.data === 'done') {
        setReady(true);
        setBusy(null);
        return;
      }
      if (e.data instanceof ArrayBuffer && pendingExport.current) {
        const fmt = pendingExport.current;
        pendingExport.current = null;
        const blob = new Blob([e.data], { type: fmt.mime });
        void save(blob, outputName(`${docName}.${fmt.ext}`, 'edited', fmt.ext));
        addHistory(tool.id, `Exported ${fmt.label} from Photopea`);
      }
    };
    window.addEventListener('message', onMessage);
    return () => window.removeEventListener('message', onMessage);
  }, [save, docName, addHistory, tool.id]);

  // Open any queued files once ready.
  useEffect(() => {
    if (ready && queue.current.length) {
      const files = queue.current;
      queue.current = [];
      void openFiles(files);
    }
  }, [ready, openFiles]);

  // Esc leaves full-window mode; keep state in sync when the browser exits fullscreen.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && size === 'window') setSize('fit');
    };
    const onFs = () => {
      if (!document.fullscreenElement && size === 'fullscreen') setSize('fit');
    };
    window.addEventListener('keydown', onKey);
    document.addEventListener('fullscreenchange', onFs);
    return () => {
      window.removeEventListener('keydown', onKey);
      document.removeEventListener('fullscreenchange', onFs);
    };
  }, [size]);

  // Full window hides the page behind; stop the body scrolling underneath.
  useEffect(() => {
    if (size !== 'window') return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = prev;
    };
  }, [size]);

  const goFullscreen = async () => {
    if (!canFullscreen() || !shellRef.current) {
      setSize('window');
      return;
    }
    try {
      await shellRef.current.requestFullscreen();
      setSize('fullscreen');
    } catch {
      setSize('window');
    }
  };
  const exitSize = async () => {
    if (document.fullscreenElement) await document.exitFullscreen().catch(() => {});
    setSize('fit');
  };

  const exportAs = (fmt: ExportFormat) => {
    if (!ready) return;
    pendingExport.current = fmt;
    setBusy(`Exporting ${fmt.label}…`);
    // saveToOE fails quietly if no document is open; tell the user instead of waiting forever.
    post(`if (app.documents.length == 0) { app.echoToOE("no-document"); } else { app.activeDocument.saveToOE("${fmt.script}"); }`);
    setTimeout(() => {
      if (pendingExport.current === fmt) {
        pendingExport.current = null;
        setBusy(null);
        toast.warning('Nothing was exported', 'Open or create an image in Photopea first.');
      }
    }, 20_000);
  };

  // Photopea answers "no-document" through echoToOE.
  useEffect(() => {
    const onMessage = (e: MessageEvent) => {
      if (e.origin === ORIGIN && e.data === 'no-document' && pendingExport.current) {
        pendingExport.current = null;
        setBusy(null);
        toast.warning('No image is open in Photopea', 'Open an image first, then export.');
      }
    };
    window.addEventListener('message', onMessage);
    return () => window.removeEventListener('message', onMessage);
  }, []);

  if (!started) {
    return (
      <Card className="mx-auto max-w-2xl space-y-4 p-6">
        <div className="flex items-start gap-3">
          <ShieldAlert size={22} className="mt-0.5 shrink-0 text-warning" aria-hidden />
          <div className="space-y-2 text-sm">
            <h2 className="text-base font-semibold">Photopea is an external service</h2>
            <p className="text-muted">
              Photopea is a separate, free web app from <strong className="text-fg">photopea.com</strong>, shown here in a frame. Loading it contacts Photopea’s servers and shows their advertising, and their{' '}
              <a href="https://www.photopea.com/privacy" target="_blank" rel="noopener noreferrer" className="link">
                privacy policy
              </a>{' '}
              applies. Images you open are passed to the Photopea frame in your browser. Photopea says it edits files on your device, but {APP.name} cannot check or control what a third-party app does.
            </p>
            <p className="text-muted">For private files, prefer the local tools such as Crop, Resize, Watermark and Convert, which never leave this app.</p>
          </div>
        </div>
        <Toggle checked={remember} onChange={setRemember} label="Load Photopea automatically next time" />
        <div className="flex flex-wrap gap-2">
          <Button
            variant="primary"
            size="lg"
            icon={<ExternalLink size={16} />}
            onClick={() => {
              if (remember) updateSettings({ photopeaAutoLoad: true });
              setStarted(true);
            }}
          >
            Load Photopea
          </Button>
          <a href={SITE} target="_blank" rel="noopener noreferrer">
            <Button size="lg">Open photopea.com in a new tab</Button>
          </a>
        </div>
      </Card>
    );
  }

  const full = size !== 'fit';

  return (
    <div
      ref={shellRef}
      className={clsx(
        'flex flex-col overflow-hidden bg-surface',
        size === 'fit' && 'h-[calc(100dvh-150px)] min-h-[560px] rounded-lg border border-line',
        size === 'window' && 'fixed inset-0 z-[80]',
        size === 'fullscreen' && 'h-full w-full',
      )}
      role={full ? 'dialog' : undefined}
      aria-modal={full || undefined}
      aria-label={full ? 'Photopea editor' : undefined}
    >
      <div className="flex flex-wrap items-center gap-2 border-b border-line bg-surface px-3 py-2">
        <span className="inline-flex items-center gap-1.5 rounded border border-warning/30 bg-warning/10 px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wide text-warning" title="This editor runs on photopea.com">
          <ExternalLink size={12} aria-hidden /> External · Photopea
        </span>
        <Button size="sm" icon={<FolderOpen size={14} />} disabled={!ready} onClick={() => fileInput.current?.click()}>
          Open image
        </Button>
        <input
          ref={fileInput}
          type="file"
          accept="image/*,.psd,.xcf,.sketch,.ai,.pdf,.svg"
          multiple
          className="sr-only"
          tabIndex={-1}
          aria-hidden
          onChange={(e) => {
            void openFiles(Array.from(e.target.files ?? []));
            e.target.value = '';
          }}
        />
        <span className="hidden text-xs text-muted sm:inline">Save as:</span>
        {EXPORTS.map((f) => (
          <Button key={f.id} size="sm" icon={<Download size={14} />} disabled={!ready || !!pendingExport.current} onClick={() => exportAs(f)} aria-label={`Save as ${f.label}`}>
            {f.label}
          </Button>
        ))}
        <span className="ml-auto text-xs text-muted" aria-live="polite">
          {!ready ? 'Loading Photopea…' : busy ?? ''}
        </span>
        <div className="flex gap-1">
          {size === 'fit' ? (
            <>
              <Button size="sm" icon={<Maximize2 size={14} />} onClick={() => setSize('window')} title="Fill the browser window">
                <span className="hidden sm:inline">Full window</span>
              </Button>
              <Button size="sm" icon={<Maximize size={14} />} onClick={goFullscreen} title="Use the whole screen">
                <span className="hidden sm:inline">Fullscreen</span>
              </Button>
            </>
          ) : (
            <Button size="sm" variant="primary" icon={size === 'window' ? <X size={14} /> : <Minimize2 size={14} />} onClick={exitSize} title="Back to normal size (Esc)">
              Exit full size
            </Button>
          )}
        </div>
      </div>
      <iframe
        ref={frameRef}
        src={SRC}
        title="Photopea image editor (external service from photopea.com)"
        className="min-h-0 w-full flex-1 border-0 bg-[#474747]"
        // Photopea needs scripts, its own storage, downloads and popups; sandboxing stops it (or its ads) navigating this page.
        sandbox="allow-scripts allow-same-origin allow-downloads allow-popups allow-popups-to-escape-sandbox allow-forms allow-modals allow-pointer-lock"
        allow="fullscreen; clipboard-read; clipboard-write"
        referrerPolicy="strict-origin-when-cross-origin"
      />
      {size === 'fit' && (
        <p className="border-t border-line px-3 py-2 text-xs text-muted">
          You can also use Photopea’s own <em>File → Export as</em>, which downloads straight from the editor. Best on a desktop or tablet.{' '}
          <button className="link" onClick={() => updateSettings({ photopeaAutoLoad: false })} hidden={!autoLoad}>
            Stop loading automatically
          </button>
        </p>
      )}
    </div>
  );
}
