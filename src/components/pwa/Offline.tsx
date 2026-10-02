import { useEffect, useState } from 'react';
import { CheckCircle2, CloudDownload, Loader2, Wifi, WifiOff, Download, Smartphone, Trash2 } from 'lucide-react';
import type { ToolDefinition } from '@/types/tool';
import { Button, Progress } from '@/components/ui/primitives';
import { toast } from '@/components/ui/Toast';
import { formatBytes } from '@/utils/format';
import { usePwa, toolOfflineInfo, saveForOffline, offlineSummary, removeOfflineTools, promptInstall, isIos, offlineManifest, type ToolOfflineInfo } from '@/pwa/pwa';

/**
 * Honest per-tool offline status: "Available offline" only when every file the
 * tool needs is in this browser's cache; otherwise a button to save it.
 */
export function ToolOfflineStatus({ tool }: { tool: ToolDefinition }) {
  const tick = usePwa((s) => s.cacheTick);
  const sw = usePwa((s) => s.sw);
  const [info, setInfo] = useState<ToolOfflineInfo | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (tool.offline === 'no') return;
    let alive = true;
    const check = () => void toolOfflineInfo(tool.id).then((i) => alive && setInfo(i));
    check();
    // Files fetched while the tool loads are cached a moment later.
    const h = setTimeout(check, 2500);
    return () => {
      alive = false;
      clearTimeout(h);
    };
  }, [tool.id, tool.offline, tick, sw]);

  if (tool.offline === 'no')
    return (
      <span className="inline-flex items-center gap-1">
        <WifiOff size={13} aria-hidden /> Needs internet
      </span>
    );
  if (!info || info.state === 'unavailable')
    return (
      <span className="inline-flex items-center gap-1">
        <Wifi size={13} aria-hidden /> No internet needed once open
      </span>
    );
  if (info.state === 'ready')
    return (
      <span className="inline-flex items-center gap-1 text-success">
        <CheckCircle2 size={13} aria-hidden /> Available offline
      </span>
    );
  return (
    <button
      disabled={saving}
      onClick={async () => {
        setSaving(true);
        try {
          await saveForOffline([tool.id]);
          toast.success(`${tool.name} is saved for offline use`);
        } catch (err) {
          toast.error('Could not save for offline use', (err as Error).message);
        } finally {
          setSaving(false);
        }
      }}
      className="inline-flex items-center gap-1 rounded text-accent hover:underline disabled:opacity-60"
    >
      {saving ? <Loader2 size={13} className="animate-spin" aria-hidden /> : <CloudDownload size={13} aria-hidden />}
      {saving ? 'Saving…' : `Save for offline${info.bytes ? ` · ${formatBytes(info.bytes)}` : ''}`}
    </button>
  );
}

/** Settings → App & offline. */
export function OfflineSettings() {
  const { sw, installed, canInstall, online, cacheTick } = usePwa();
  const [summary, setSummary] = useState<{ ready: number; total: number; totalBytes: number } | null>(null);
  const [progress, setProgress] = useState<number | null>(null);
  const [version, setVersion] = useState('');

  useEffect(() => {
    void offlineSummary().then(setSummary);
    void offlineManifest().then((m) => setVersion(m?.version ?? ''));
  }, [cacheTick, sw]);

  return (
    <div className="space-y-4">
      <div>
        <p className="text-sm font-medium">Install as an app</p>
        {installed ? (
          <p className="mt-1 flex items-center gap-1.5 text-sm text-success">
            <CheckCircle2 size={16} aria-hidden /> You are using the installed app.
          </p>
        ) : canInstall ? (
          <div className="mt-2 flex flex-wrap items-center gap-3">
            <Button variant="primary" icon={<Download size={16} />} onClick={() => void promptInstall()}>
              Install Dhurta Suite
            </Button>
            <span className="text-xs text-muted">Opens in its own window, works offline, and can open files from your computer.</span>
          </div>
        ) : isIos() ? (
          <p className="mt-1 flex gap-2 text-sm text-muted">
            <Smartphone size={16} className="mt-0.5 shrink-0" aria-hidden /> In Safari, tap the Share button, then “Add to Home Screen”.
          </p>
        ) : (
          <p className="mt-1 text-sm text-muted">Use your browser menu: “Install app” (Chrome, Edge) or “Add to Home screen” (Android). Firefox on desktop does not install web apps.</p>
        )}
      </div>

      <div className="border-t border-line pt-4">
        <p className="text-sm font-medium">Offline use</p>
        {sw === 'unsupported' ? (
          <p className="mt-1 text-sm text-muted">This browser does not support offline web apps. Tools still need no upload, but the site needs a connection to load.</p>
        ) : sw === 'dev' ? (
          <p className="mt-1 text-sm text-muted">Offline support is turned off in the development build.</p>
        ) : sw === 'error' ? (
          <p className="mt-1 text-sm text-error">Offline support could not start in this browser (storage may be blocked, e.g. in a private window).</p>
        ) : !summary ? (
          <p className="mt-1 text-sm text-muted">Checking…</p>
        ) : (
          <div className="mt-2 space-y-3">
            <p className="text-sm text-muted">
              <strong className="text-fg">
                {summary.ready} of {summary.total}
              </strong>{' '}
              tools are saved on this device and open without internet. Tools you open are saved automatically.
            </p>
            {progress !== null && <Progress value={progress} label="Downloading tools for offline use" />}
            <div className="flex flex-wrap gap-2">
              <Button
                variant="primary"
                icon={<CloudDownload size={16} />}
                disabled={progress !== null || summary.ready === summary.total || !online}
                onClick={async () => {
                  const m = await offlineManifest();
                  if (!m) return;
                  setProgress(0);
                  try {
                    await saveForOffline(Object.keys(m.tools), setProgress);
                    toast.success('All tools are saved for offline use');
                  } catch (err) {
                    toast.error('The download stopped', (err as Error).message);
                  } finally {
                    setProgress(null);
                  }
                }}
              >
                {summary.ready === summary.total ? 'All tools saved' : `Save all tools for offline (up to ${formatBytes(summary.totalBytes)})`}
              </Button>
              <Button
                icon={<Trash2 size={16} />}
                disabled={progress !== null || summary.ready === 0}
                onClick={async () => {
                  await removeOfflineTools();
                  toast.success('Saved tools removed', 'The app itself stays available offline.');
                }}
              >
                Remove saved tools
              </Button>
            </div>
            <p className="text-xs text-muted">
              Only the app’s own code is stored (in your browser’s cache) — never the files you process.{version && ` App version ${version}.`}
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
