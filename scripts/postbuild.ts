/**
 * Post-build step (run with vite-node so the registry's path aliases resolve):
 *  - one HTML file per route with its own title, description, canonical and
 *    Open Graph tags, so deep links return 200 and are indexable on static
 *    hosts (GitHub Pages serves /tools/x from tools/x.html)
 *  - sitemap.xml and robots.txt generated from the tool registry
 *  - SPA fallbacks for any other route (404.html for GitHub Pages,
 *    _redirects for Netlify / Cloudflare Pages)
 */
import { copyFileSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { APP } from '../src/app/config';
import { TOOLS, CATEGORIES, isUsable } from '../src/tools/registry';

const dist = join(process.cwd(), 'dist');
const base = APP.siteUrl.replace(/\/$/, '');
const today = new Date().toISOString().slice(0, 10);
const template = readFileSync(join(dist, 'index.html'), 'utf8');

const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

interface Page {
  path: string;
  title: string;
  description: string;
  /** Static content shown to crawlers and before the app loads; replaced by React. */
  body: string;
  sitemap: boolean;
}

const toolLink = (id: string, name: string) => `<li><a href="/tools/${id}">${esc(name)}</a></li>`;

const pages: Page[] = [
  {
    path: '/tools',
    title: `All tools — ${APP.name}`,
    description: `Every ${APP.name} tool, grouped by category. Image, PDF, text, data and developer tools that run in your browser.`,
    body: `<h1>All tools</h1><ul>${TOOLS.filter(isUsable).map((t) => toolLink(t.id, t.name)).join('')}</ul>`,
    sitemap: true,
  },
  { path: '/privacy', title: `Privacy — ${APP.name}`, description: `How ${APP.name} handles your files and data: local processing, no uploads, no account.`, body: '<h1>Privacy</h1>', sitemap: true },
  { path: '/about', title: `About — ${APP.name}`, description: `${APP.name}: a privacy-first, browser-native productivity suite.`, body: `<h1>About ${esc(APP.name)}</h1>`, sitemap: true },
  ...['settings', 'history', 'workspace', 'diagnostics'].map((p) => ({ path: `/${p}`, title: `${p[0].toUpperCase()}${p.slice(1)} — ${APP.name}`, description: APP.tagline, body: '', sitemap: false })),
  ...CATEGORIES.map((c) => {
    const tools = TOOLS.filter((t) => t.category === c.id);
    return {
      path: `/category/${c.id}`,
      title: `${c.name} tools — ${APP.name}`,
      description: c.description,
      body: `<h1>${esc(c.name)} tools</h1><p>${esc(c.description)}</p><ul>${tools.map((t) => toolLink(t.id, t.name)).join('')}</ul>`,
      sitemap: true,
    };
  }),
  ...TOOLS.map((t) => ({
    path: `/tools/${t.id}`,
    title: `${t.name} — ${APP.name}`,
    description: isUsable(t) ? `${t.description} Free, private, runs in your browser — no upload.` : `${t.name} (coming soon). ${t.description}`,
    body: `<h1>${esc(t.name)}</h1><p>${esc(t.description)}</p>${t.processing === 'client' && isUsable(t) ? '<p>Your files are processed inside your browser. No upload, no account.</p>' : ''}`,
    sitemap: true,
  })),
];

function render(page: Page): string {
  const url = base + page.path;
  const head = [
    `<title>${esc(page.title)}</title>`,
    `<meta name="description" content="${esc(page.description)}" />`,
    `<link rel="canonical" href="${esc(url)}" />`,
    `<meta property="og:title" content="${esc(page.title)}" />`,
    `<meta property="og:description" content="${esc(page.description)}" />`,
    `<meta property="og:url" content="${esc(url)}" />`,
  ].join('\n    ');
  return template
    .replace(/<title>[\s\S]*?<\/title>/, '')
    .replace(/\s*<meta name="description"[^>]*>/, '')
    .replace(/\s*<meta property="og:title"[^>]*>/, '')
    .replace(/\s*<meta property="og:description"[^>]*>/, '')
    .replace('</head>', `    ${head}\n  </head>`)
    .replace('<div id="root"></div>', `<div id="root">${page.body}</div>`);
}

for (const page of pages) {
  const html = render(page);
  const file = join(dist, `${page.path.slice(1)}.html`);
  mkdirSync(dirname(file), { recursive: true });
  writeFileSync(file, html);
  // Also serve /path/ (directory form), e.g. when a host redirects to a trailing slash.
  const dirIndex = join(dist, page.path.slice(1), 'index.html');
  mkdirSync(dirname(dirIndex), { recursive: true });
  writeFileSync(dirIndex, html);
}

// Home page keeps the template but gains a canonical link.
writeFileSync(join(dist, 'index.html'), template.replace('</head>', `    <link rel="canonical" href="${base}/" />\n    <meta property="og:url" content="${base}/" />\n  </head>`));

const sitemapPaths = ['/', ...pages.filter((p) => p.sitemap).map((p) => p.path)];
writeFileSync(
  join(dist, 'sitemap.xml'),
  `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${sitemapPaths.map((p) => `  <url><loc>${base}${p}</loc><lastmod>${today}</lastmod></url>`).join('\n')}\n</urlset>\n`,
);
writeFileSync(join(dist, 'robots.txt'), `User-agent: *\nAllow: /\n\nSitemap: ${base}/sitemap.xml\n`);
copyFileSync(join(dist, 'index.html'), join(dist, '404.html'));
writeFileSync(join(dist, '_redirects'), '/*  /index.html  200\n');

console.log(`postbuild: ${pages.length} route pages, sitemap with ${sitemapPaths.length} URLs, robots.txt, 404.html, _redirects`);
