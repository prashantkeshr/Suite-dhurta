import { useEffect } from 'react';
import { APP } from '@/app/config';

function setMeta(attr: 'name' | 'property', key: string, content: string) {
  let el = document.head.querySelector<HTMLMetaElement>(`meta[${attr}="${key}"]`);
  if (!el) {
    el = document.createElement('meta');
    el.setAttribute(attr, key);
    document.head.appendChild(el);
  }
  el.content = content;
}

/** Per-page title, description, canonical URL and Open Graph tags. */
export function useDocumentMeta(title: string, description?: string, path?: string) {
  useEffect(() => {
    // Titles that already carry the brand (e.g. SEO tool titles) are used as-is.
    const full = !title ? `${APP.name} — ${APP.tagline}` : title.includes(APP.name) ? title : `${title} — ${APP.name}`;
    document.title = full;
    setMeta('property', 'og:title', full);
    if (description) {
      setMeta('name', 'description', description);
      setMeta('property', 'og:description', description);
    }
    if (path !== undefined) {
      const href = APP.siteUrl + path;
      let link = document.head.querySelector<HTMLLinkElement>('link[rel="canonical"]');
      if (!link) {
        link = document.createElement('link');
        link.rel = 'canonical';
        document.head.appendChild(link);
      }
      link.href = href;
      setMeta('property', 'og:url', href);
    }
  }, [title, description, path]);
}
