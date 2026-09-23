import { useEffect, useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { useStore, type Accent } from '@/storage/store';
import { storageEstimate } from '@/storage/kv';
import { capabilities } from '@/capabilities/detect';
import { SHORTCUTS } from '@/app/shortcuts';
import { formatBytes } from '@/utils/format';
import { useDocumentMeta } from '@/hooks/useDocumentMeta';
import { t } from '@/i18n';
import { Button, Card, Segmented, Select, Toggle, Kbd } from '@/components/ui/primitives';
import { Dialog } from '@/components/ui/Dialog';
import { toast } from '@/components/ui/Toast';
import { Breadcrumb } from '@/components/tools/common';

function Section({ id, title, children }: { id: string; title: string; children: React.ReactNode }) {
  return (
    <Card as="section" className="p-4 sm:p-5">
      <h2 id={id} className="mb-3 text-base font-semibold">
        {title}
      </h2>
      <div className="space-y-4">{children}</div>
    </Card>
  );
}

const ACCENTS: { value: Accent; label: string; color: string }[] = [
  { value: 'blue', label: 'Blue', color: '#2563eb' },
  { value: 'teal', label: 'Teal', color: '#0d9488' },
  { value: 'violet', label: 'Violet', color: '#6d28d9' },
  { value: 'orange', label: 'Orange', color: '#c2410c' },
];

export default function SettingsPage() {
  useDocumentMeta('Settings', 'Appearance, processing, download and privacy preferences, stored only in this browser.', '/settings');
  const { settings, updateSettings, clearHistory, resetAll } = useStore();
  const [usage, setUsage] = useState<{ usage?: number; quota?: number }>({});
  const [confirmReset, setConfirmReset] = useState(false);
  const caps = capabilities();
  const { hash } = useLocation();

  useEffect(() => {
    storageEstimate().then(setUsage);
  }, []);
  useEffect(() => {
    if (hash) document.getElementById(hash.slice(1))?.scrollIntoView();
  }, [hash]);

  return (
    <div className="max-w-3xl">
      <Breadcrumb items={[{ label: t('nav.home'), to: '/' }, { label: t('nav.settings') }]} />
      <h1 className="text-2xl font-semibold tracking-tight">{t('nav.settings')}</h1>
      <p className="mt-1 text-muted">Settings are saved in this browser only. There is no account.</p>

      <div className="mt-6 space-y-4">
        <Section id="appearance" title="Appearance">
          <Segmented
            label="Theme"
            value={settings.theme}
            onChange={(theme) => updateSettings({ theme })}
            options={[
              { value: 'system', label: t('theme.system') },
              { value: 'light', label: t('theme.light') },
              { value: 'dark', label: t('theme.dark') },
            ]}
          />
          <div>
            <span className="label">Accent colour</span>
            <div role="radiogroup" aria-label="Accent colour" className="flex gap-2">
              {ACCENTS.map((a) => (
                <button
                  key={a.value}
                  role="radio"
                  aria-checked={settings.accent === a.value}
                  aria-label={a.label}
                  title={a.label}
                  onClick={() => updateSettings({ accent: a.value })}
                  className="flex h-10 w-10 items-center justify-center rounded-full border-2"
                  style={{ borderColor: settings.accent === a.value ? a.color : 'transparent' }}
                >
                  <span className="h-7 w-7 rounded-full" style={{ background: a.color }} />
                </button>
              ))}
            </div>
          </div>
          <Segmented
            label="Reduced motion"
            value={settings.reducedMotion}
            onChange={(reducedMotion) => updateSettings({ reducedMotion })}
            options={[
              { value: 'system', label: 'Follow system' },
              { value: 'on', label: 'Reduce' },
              { value: 'off', label: 'Allow animation' },
            ]}
          />
        </Section>

        <Section id="processing" title="Processing">
          <Select
            label="Default image output format"
            value={settings.defaultImageFormat}
            onChange={(e) => updateSettings({ defaultImageFormat: e.target.value as typeof settings.defaultImageFormat })}
            options={[
              { value: 'image/webp', label: 'WebP (smallest, modern browsers)' },
              { value: 'image/jpeg', label: 'JPEG (most compatible)' },
              { value: 'image/png', label: 'PNG (lossless, keeps transparency)' },
            ]}
          />
          <div>
            <label htmlFor="q" className="label">
              Default compression quality: {Math.round(settings.defaultQuality * 100)}%
            </label>
            <input id="q" type="range" min={0.3} max={1} step={0.01} value={settings.defaultQuality} onChange={(e) => updateSettings({ defaultQuality: Number(e.target.value) })} className="w-full accent-[rgb(var(--accent))]" />
          </div>
          <Toggle
            checked={settings.useWorkers && caps.workers}
            onChange={(v) => updateSettings({ useWorkers: v })}
            label="Use background workers"
            description={caps.workers ? 'Processes images off the main thread so the page stays responsive. Turn off only for troubleshooting.' : 'Not supported in this browser.'}
          />
        </Section>

        <Section id="downloads" title="Downloads">
          <Toggle
            checked={settings.useSaveDialog && caps.fileSystemAccess}
            onChange={(v) => updateSettings({ useSaveDialog: v })}
            label="Ask where to save each file"
            description={
              caps.fileSystemAccess
                ? 'Uses the native save dialog (File System Access API). When off, files go to your usual Downloads folder.'
                : 'This browser does not support the native save dialog. Files are downloaded normally.'
            }
          />
          <Toggle checked={settings.filenameSuffix} onChange={(v) => updateSettings({ filenameSuffix: v })} label="Add an operation suffix to file names" description="For example photo-resized.webp instead of photo.webp." />
        </Section>

        <Section id="privacy" title="Privacy">
          <Toggle
            checked={settings.historyEnabled}
            onChange={(v) => updateSettings({ historyEnabled: v })}
            label="Keep local history"
            description="Records tool names and short summaries (never file contents) in this browser. Turning it off also clears it."
          />
          <div className="flex flex-wrap gap-2">
            <Button
              onClick={() => {
                clearHistory();
                toast.success('History cleared');
              }}
            >
              {t('history.clear')}
            </Button>
            <Button variant="danger" onClick={() => setConfirmReset(true)}>
              Clear all local data
            </Button>
          </div>
          <p className="text-xs text-muted">
            Local storage used by this site: {usage.usage != null ? formatBytes(usage.usage) : 'not reported by this browser'}.
          </p>
        </Section>

        <Section id="shortcuts" title="Keyboard shortcuts">
          <dl className="grid grid-cols-[auto_1fr] gap-x-6 gap-y-2 text-sm">
            {SHORTCUTS.map((s) => (
              <div key={s.keys} className="contents">
                <dt>
                  <Kbd>{s.keys}</Kbd>
                </dt>
                <dd className="text-muted">{s.description}</dd>
              </div>
            ))}
          </dl>
          <p className="text-xs text-muted">Browser shortcuts are not overridden except where a page offers the same action.</p>
        </Section>

        <Section id="advanced" title="Advanced">
          <p className="text-sm text-muted">
            See what this browser supports on the <Link to="/diagnostics" className="link">diagnostics page</Link>.
          </p>
        </Section>
      </div>

      <Dialog
        open={confirmReset}
        onClose={() => setConfirmReset(false)}
        title="Clear all local data?"
        description="Settings, favorites, history and reminders stored in this browser will be deleted. This cannot be undone."
        footer={
          <>
            <Button onClick={() => setConfirmReset(false)}>{t('action.cancel')}</Button>
            <Button
              variant="danger"
              onClick={async () => {
                await resetAll();
                setConfirmReset(false);
                toast.success('All local data cleared');
              }}
            >
              Clear everything
            </Button>
          </>
        }
      />
    </div>
  );
}
