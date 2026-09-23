/**
 * Post-build step (run with vite-node so the registry's path aliases resolve):
 *  - sitemap.xml and robots.txt generated from the tool registry
 *  - SPA fallbacks for static hosts (404.html for GitHub Pages, _redirects for
 *    Netlify / Cloudflare Pages)
 */
import { copyFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { APP } from '../src/app/config';
import { TOOLS, CATEGORIES } from '../src/tools/registry';

const dist = join(process.cwd(), 'dist');
const base = APP.siteUrl.replace(/\/$/, '');
const today = new Date().toISOString().slice(0, 10);

const paths = [
  '/',
  '/tools',
  '/privacy',
  '/about',
  ...CATEGORIES.map((c) => `/category/${c.id}`),
  ...TOOLS.map((t) => `/tools/${t.id}`),
];

const xml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${paths.map((p) => `  <url><loc>${base}${p}</loc><lastmod>${today}</lastmod></url>`).join('\n')}
</urlset>
`;

writeFileSync(join(dist, 'sitemap.xml'), xml);
writeFileSync(join(dist, 'robots.txt'), `User-agent: *\nAllow: /\n\nSitemap: ${base}/sitemap.xml\n`);
copyFileSync(join(dist, 'index.html'), join(dist, '404.html'));
writeFileSync(join(dist, '_redirects'), '/*  /index.html  200\n');

console.log(`postbuild: sitemap with ${paths.length} URLs, robots.txt, 404.html, _redirects`);
