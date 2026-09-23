import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { APP } from '@/app/config';
import { TOOLS, CATEGORIES, isUsable } from '@/tools/registry';
import { useDocumentMeta } from '@/hooks/useDocumentMeta';
import { t } from '@/i18n';
import { Card } from '@/components/ui/primitives';
import { EmptyState } from '@/components/ui/states';
import { Breadcrumb } from '@/components/tools/common';

function Prose({ children }: { children: ReactNode }) {
  return <div className="space-y-4 text-[15px] leading-relaxed text-fg [&_h2]:mt-8 [&_h2]:text-lg [&_h2]:font-semibold [&_li]:ml-5 [&_li]:list-disc [&_p]:text-muted [&_ul]:space-y-1 [&_ul]:text-muted">{children}</div>;
}

export function PrivacyPage() {
  useDocumentMeta('Privacy', `How ${APP.name} handles your files and data.`, '/privacy');
  const external = TOOLS.filter((x) => x.processing === 'external');
  return (
    <div className="max-w-3xl">
      <Breadcrumb items={[{ label: t('nav.home'), to: '/' }, { label: t('nav.privacy') }]} />
      <h1 className="text-2xl font-semibold tracking-tight">Privacy</h1>
      <Prose>
        <p className="mt-2">This page explains, plainly, what happens to your files and data. Last updated with version {APP.version}.</p>

        <h2>Local processing</h2>
        <p>
          Tools marked <strong className="text-fg">Local processing</strong> run entirely inside your browser tab. Your file is read into the tab’s memory, processed with JavaScript
          or WebAssembly, and handed back to you as a download. It is not uploaded to {APP.name} or to anyone else. You can check this yourself: open your browser’s developer
          tools, go to the Network tab, and use a tool — no request carries your file.
        </p>

        <h2>No account, no mandatory uploads</h2>
        <p>There is no sign-up, login, email or profile. The core tools work without any of them.</p>

        <h2>What is stored in your browser</h2>
        <ul>
          <li>Settings (theme, defaults) and your favorite tools.</li>
          <li>Recent tools and a short activity history, such as “3 files → WebP”. File contents are never stored. You can turn history off or clear it in Settings.</li>
          <li>Reminders for upcoming tools you asked to be told about.</li>
        </ul>
        <p>
          This data is kept in IndexedDB on your device. It is not sent to a server. You can delete all of it from <Link to="/settings#privacy" className="link">Settings → Privacy</Link>, or
          by clearing this site’s data in your browser.
        </p>

        <h2>External services</h2>
        {external.length ? (
          <p>
            Some tools use an external web service. They are always labelled <strong className="text-fg">External service</strong> with the provider’s name, and never shown as local:{' '}
            {external.map((x) => `${x.name} (${x.externalService?.name})`).join(', ')}. When you use one, that provider’s privacy policy applies.
          </p>
        ) : (
          <p>No tool currently uses an external service.</p>
        )}

        <h2>Hosting</h2>
        <p>
          The app itself is a static website. Like any website, the host that serves it can see standard request information (such as your IP address and which page was loaded)
          when the app’s code is downloaded. This does not include your files. There is no analytics or tracking script in the app.
        </p>

        <h2>Limitations of browser security</h2>
        <p>
          Local processing protects your files from the network, but it cannot protect them from software already on your device. Browser extensions with access to all sites
          can read page content, including files you open here. If a file is highly sensitive, use a browser profile without extensions.
        </p>

        <h2>Hashing, encoding and encryption</h2>
        <p>
          These are different things and the app labels them honestly. <strong className="text-fg">Encoding</strong> (Base64, URL) is reversible by anyone.{' '}
          <strong className="text-fg">Hashing</strong> (SHA-256) is a one-way fingerprint. <strong className="text-fg">Encryption</strong> requires a key or password to reverse.
        </p>
      </Prose>
    </div>
  );
}

export function AboutPage() {
  useDocumentMeta('About', `${APP.name}: a privacy-first, browser-native productivity suite.`, '/about');
  const usable = TOOLS.filter(isUsable);
  const soon = TOOLS.filter((x) => !isUsable(x));
  return (
    <div className="max-w-3xl">
      <Breadcrumb items={[{ label: t('nav.home'), to: '/' }, { label: t('nav.about') }]} />
      <h1 className="text-2xl font-semibold tracking-tight">About {APP.name}</h1>
      <Prose>
        <p className="mt-2">
          {APP.name} is a collection of productivity tools that run inside your web browser. It is built by {APP.org} around one idea: you should be able to convert, compress
          and inspect your files without uploading them to someone else’s server.
        </p>
        <h2>How it works</h2>
        <p>
          The whole application is a static website. There is no backend, no database and no account system. Heavy work such as image encoding runs in background Web Workers
          so the page stays responsive, and each tool’s code is only downloaded when you open it.
        </p>
        <h2>Honest about limits</h2>
        <p>
          Some conversions, such as PDF to Word, cannot yet be done reliably in a browser. Rather than ship something broken, those tools are marked{' '}
          <strong className="text-fg">Coming soon</strong> and have no upload form. When a browser lacks a feature a tool needs, the tool says so.
        </p>
      </Prose>
      <div className="mt-6 grid gap-3 sm:grid-cols-2">
        <Card className="p-4">
          <p className="text-2xl font-semibold">{usable.length}</p>
          <p className="text-sm text-muted">tools available today across {CATEGORIES.length} categories</p>
        </Card>
        <Card className="p-4">
          <p className="text-2xl font-semibold">{soon.length}</p>
          <p className="text-sm text-muted">tools planned and clearly marked as coming soon</p>
        </Card>
      </div>
      <p className="mt-6 text-sm text-muted">
        Version {APP.version}. <Link to="/tools" className="link">Browse all tools</Link> · <Link to="/privacy" className="link">Privacy</Link>
      </p>
    </div>
  );
}

export function NotFoundPage() {
  useDocumentMeta('Page not found');
  return (
    <EmptyState
      title="Page not found"
      body="The page you are looking for does not exist."
      action={
        <Link to="/" className="link">
          {t('nav.home')}
        </Link>
      }
    />
  );
}
