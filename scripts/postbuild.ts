/**
 * Post-build SEO & AI-discovery step (run with vite-node so path aliases resolve).
 *
 * For every route it writes a real HTML file (GitHub Pages serves /tools/x
 * from tools/x.html with status 200) containing:
 *   - title, description, canonical, robots, Open Graph and Twitter tags
 *   - JSON-LD structured data (WebApplication, FAQPage, HowTo, BreadcrumbList…)
 *   - readable static content (heading, how-to, FAQ, formats, related links)
 *     so crawlers and AI bots that don't run JavaScript still see the page.
 *     React replaces this content when the app starts.
 *
 * Also generates: sitemap index + sitemaps, robots.txt (AI crawlers welcome),
 * llms.txt / llms-full.txt, site.webmanifest, 404.html and _redirects.
 */
import { execSync } from 'node:child_process';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { APP } from '../src/app/config';
import { TOOLS, CATEGORIES, isUsable, getCategory, relatedTools, formatLabel, sortTools } from '../src/tools/registry';
import type { ToolDefinition } from '../src/types/tool';
import { SITE, OG_IMAGE, toolTitle, toolDescription, toolFaqs, toolSteps, toolJsonLd, organizationLd, websiteLd, breadcrumbLd, collectionLd, faqLd, type Faq } from '../src/seo/seo';

const dist = join(process.cwd(), 'dist');
const template = readFileSync(join(dist, 'index.html'), 'utf8');
if (!template.includes('<!-- seo:start')) throw new Error('index.html is missing the <!-- seo:start --> marker');

/** Last-modified date: the commit being built (falls back to today). */
const lastmod = (() => {
  try {
    return execSync('git log -1 --format=%cI', { encoding: 'utf8' }).trim().slice(0, 10);
  } catch {
    return new Date().toISOString().slice(0, 10);
  }
})();

const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
/** JSON-LD must not contain "</script>" — escape "<" inside the JSON. */
const ldScript = (data: unknown) => `<script type="application/ld+json">${JSON.stringify(data).replace(/</g, '\\u003c')}</script>`;

const usableTools = sortTools(TOOLS.filter(isUsable));
const plannedTools = TOOLS.filter((t) => !isUsable(t));

interface Page {
  path: string;
  title: string;
  description: string;
  body: string;
  jsonLd?: unknown[];
  index: boolean;
  sitemap?: 'pages' | 'categories' | 'tools';
  priority?: string;
  changefreq?: string;
}

function head(p: Page): string {
  const url = `${SITE}${p.path === '/' ? '/' : p.path}`;
  const v = APP.verification;
  const tags = [
    `<title>${esc(p.title)}</title>`,
    `<meta name="description" content="${esc(p.description)}" />`,
    `<link rel="canonical" href="${esc(url)}" />`,
    `<meta name="robots" content="${p.index ? 'index, follow, max-image-preview:large, max-snippet:-1' : 'noindex, follow'}" />`,
    `<meta property="og:type" content="website" />`,
    `<meta property="og:site_name" content="${esc(APP.name)}" />`,
    `<meta property="og:locale" content="en_IN" />`,
    `<meta property="og:title" content="${esc(p.title)}" />`,
    `<meta property="og:description" content="${esc(p.description)}" />`,
    `<meta property="og:url" content="${esc(url)}" />`,
    `<meta property="og:image" content="${OG_IMAGE}" />`,
    `<meta property="og:image:width" content="1200" />`,
    `<meta property="og:image:height" content="630" />`,
    `<meta property="og:image:alt" content="${esc(`${APP.name}: free online tools that never upload your files`)}" />`,
    `<meta name="twitter:card" content="summary_large_image" />`,
    `<meta name="twitter:title" content="${esc(p.title)}" />`,
    `<meta name="twitter:description" content="${esc(p.description)}" />`,
    `<meta name="twitter:image" content="${OG_IMAGE}" />`,
    v.google && `<meta name="google-site-verification" content="${esc(v.google)}" />`,
    v.bing && `<meta name="msvalidate.01" content="${esc(v.bing)}" />`,
    v.yandex && `<meta name="yandex-verification" content="${esc(v.yandex)}" />`,
    ...(p.jsonLd ?? []).map(ldScript),
  ].filter(Boolean);
  return tags.join('\n    ');
}

function render(p: Page): string {
  return template.replace(/<!-- seo:start[\s\S]*?<!-- seo:end -->/, head(p)).replace('<div id="root"></div>', `<div id="root">${p.body}</div>`);
}

/* ---------- Static content blocks ---------- */

const link = (t: ToolDefinition) => `<a href="/tools/${t.id}">${esc(t.name)}</a>`;
const toolItem = (t: ToolDefinition) => `<li>${link(t)} — ${esc(t.description)}</li>`;
const faqHtml = (faqs: Faq[]) => (faqs.length ? `<h2>Frequently asked questions</h2><dl>${faqs.map((f) => `<dt>${esc(f.q)}</dt><dd>${esc(f.a)}</dd>`).join('')}</dl>` : '');
const nav = `<nav aria-label="Categories"><ul>${CATEGORIES.map((c) => `<li><a href="/category/${c.id}">${esc(c.name)}</a></li>`).join('')}</ul></nav>`;

const SITE_FAQS: Faq[] = [
  { q: `Is ${APP.name} free?`, a: `Yes. Every tool is free to use, with no account, sign-up or watermark.` },
  { q: 'Are my files uploaded to a server?', a: `No. ${APP.name}'s own tools run entirely inside your web browser. Files are read into the page, processed on your device and offered back as a download — they are never uploaded.` },
  { q: 'Do I need to install anything?', a: 'No. It works in any current browser — Chrome, Edge, Firefox, Safari or Opera — on Windows, macOS, Linux, Android and iPhone.' },
  { q: 'Does it support Hindi and other Indian languages?', a: 'Yes. Text tools, watermarks and text-to-PDF handle Hindi and other Unicode scripts correctly.' },
  { q: 'What does “coming soon” mean?', a: 'Some conversions (such as PDF to Word or OCR) cannot yet be done reliably in a browser. They are listed honestly as coming soon instead of offering a broken tool.' },
  { q: 'Is the Photopea editor part of the suite?', a: 'Photopea is a separate, free web app from photopea.com that you can open inside the suite. It is clearly labelled as an external service and loads only after you agree.' },
];

/* ---------- Pages ---------- */

const pages: Page[] = [];

// Home
pages.push({
  path: '/',
  title: `${APP.name} — Free Online Tools That Never Upload Your Files`,
  description: `${usableTools.length}+ free online tools for images, PDF, text, data and developers that run entirely in your browser. No upload, no sign-up, works on mobile.`,
  body:
    `<header><h1>Free online tools that never upload your files</h1><p>${esc(APP.name)} is a collection of ${usableTools.length} free tools for images, PDFs, documents, spreadsheets, text, developers and everyday calculations. Everything runs inside your browser: your files stay on your device, and there is nothing to install or sign up for.</p></header>` +
    nav +
    CATEGORIES.map((c) => {
      const list = usableTools.filter((t) => t.category === c.id);
      return list.length ? `<section><h2><a href="/category/${c.id}">${esc(c.name)}</a></h2><p>${esc(c.description)}</p><ul>${list.map(toolItem).join('')}</ul></section>` : '';
    }).join('') +
    faqHtml(SITE_FAQS),
  jsonLd: [organizationLd(), websiteLd(), faqLd(SITE_FAQS)],
  index: true,
  sitemap: 'pages',
  priority: '1.0',
  changefreq: 'weekly',
});

// All tools
pages.push({
  path: '/tools',
  title: `All ${usableTools.length} Free Online Tools | ${APP.name}`,
  description: `Browse every ${APP.name} tool by category: image, PDF, document, data, developer, security, calculator and file tools. Free and private — nothing is uploaded.`,
  body: `<h1>All tools</h1>${nav}${CATEGORIES.map((c) => {
    const list = usableTools.filter((t) => t.category === c.id);
    return list.length ? `<section><h2>${esc(c.name)}</h2><ul>${list.map(toolItem).join('')}</ul></section>` : '';
  }).join('')}`,
  jsonLd: [breadcrumbLd([{ name: 'Home', path: '/' }, { name: 'All tools', path: '/tools' }])],
  index: true,
  sitemap: 'pages',
  priority: '0.9',
  changefreq: 'weekly',
});

// Categories
for (const c of CATEGORIES) {
  const list = usableTools.filter((t) => t.category === c.id);
  const soon = plannedTools.filter((t) => t.category === c.id);
  pages.push({
    path: `/category/${c.id}`,
    title: list.length ? `${list.length} Free ${c.name} Tools Online — No Upload | ${APP.name}` : `${c.name} Tools (Coming Soon) | ${APP.name}`,
    description: list.length ? `${c.description} ${list.length} free tools that run in your browser: ${list.slice(0, 5).map((t) => t.name).join(', ')}${list.length > 5 ? ' and more' : ''}.`.slice(0, 160) : `${c.description} Coming soon to ${APP.name}.`,
    body: `<h1>${esc(c.name)} tools</h1><p>${esc(c.description)}</p>${list.length ? `<ul>${list.map(toolItem).join('')}</ul>` : ''}${soon.length ? `<h2>Coming soon</h2><ul>${soon.map((t) => `<li>${esc(t.name)}</li>`).join('')}</ul>` : ''}`,
    jsonLd: [breadcrumbLd([{ name: 'Home', path: '/' }, { name: c.name, path: `/category/${c.id}` }]), collectionLd(c.id, list)],
    // Categories with no working tools are thin pages; keep them out of the index.
    index: list.length > 0,
    sitemap: list.length ? 'categories' : undefined,
    priority: '0.8',
    changefreq: 'weekly',
  });
}

// Tools
for (const t of TOOLS) {
  const usable = isUsable(t);
  const cat = getCategory(t.category);
  const related = relatedTools(t, 6);
  const facts = [
    t.inputTypes.length && !t.inputTypes.includes('*/*') ? `<li>Input formats: ${esc(formatLabel(t.inputTypes))}</li>` : '',
    t.outputTypes.length ? `<li>Output formats: ${esc(formatLabel(t.outputTypes))}</li>` : '',
    t.batch ? '<li>Batch processing: several files at once, downloadable as a ZIP</li>' : '',
    t.processing === 'client' ? '<li>Runs locally in your browser — no upload, no account</li>' : `<li>External service: ${esc(t.externalService?.name ?? '')} (${esc(t.externalService?.url ?? '')})</li>`,
  ].join('');
  const body = usable
    ? `<nav aria-label="Breadcrumb"><a href="/">Home</a> › ${cat ? `<a href="/category/${cat.id}">${esc(cat.name)}</a> › ` : ''}${esc(t.name)}</nav>` +
      `<h1>${esc(t.name)}</h1><p>${esc(t.description)}</p><ul>${facts}</ul>` +
      `<h2>How to use ${esc(t.name)}</h2><ol>${toolSteps(t).map((s) => `<li>${esc(s)}</li>`).join('')}</ol>` +
      faqHtml(toolFaqs(t)) +
      (related.length ? `<h2>Related tools</h2><ul>${related.map(toolItem).join('')}</ul>` : '')
    : `<h1>${esc(t.name)}</h1><p>Coming soon. ${esc(t.description)}</p>${t.reason ? `<p>${esc(t.reason)}</p>` : ''}${cat ? `<p><a href="/category/${cat.id}">Browse ${esc(cat.name)} tools</a></p>` : ''}`;
  pages.push({
    path: `/tools/${t.id}`,
    title: toolTitle(t),
    description: toolDescription(t),
    body,
    jsonLd: toolJsonLd(t),
    // Coming-soon pages have no working tool: noindex, but links are still followed.
    index: usable,
    sitemap: usable ? 'tools' : undefined,
    priority: t.popular ? '0.9' : '0.7',
    changefreq: 'monthly',
  });
}

// Info pages
pages.push(
  { path: '/privacy', title: `Privacy — How ${APP.name} Handles Your Files`, description: `${APP.name} processes files in your browser. Learn what is stored locally, what is never uploaded, and how external services are labelled.`, body: `<h1>Privacy</h1><p>${esc(APP.name)}'s own tools process files inside your browser; they are never uploaded. Settings and a short activity history are stored only on your device and can be cleared at any time.</p>`, index: true, sitemap: 'pages', priority: '0.5', changefreq: 'yearly' },
  { path: '/about', title: `About ${APP.name}`, description: `${APP.name} by ${APP.org}: a privacy-first suite of browser-based tools with no backend, no uploads and no sign-up.`, body: `<h1>About ${esc(APP.name)}</h1><p>A privacy-first collection of productivity tools built by ${esc(APP.org)}. It is a static website with no backend, no database and no accounts.</p>`, index: true, sitemap: 'pages', priority: '0.5', changefreq: 'yearly' },
  ...['settings', 'history', 'workspace', 'diagnostics'].map((p) => ({ path: `/${p}`, title: `${p[0].toUpperCase()}${p.slice(1)} — ${APP.name}`, description: APP.tagline, body: '', index: false })),
);

/* ---------- Write pages ---------- */

for (const p of pages) {
  const html = render(p);
  if (p.path === '/') {
    writeFileSync(join(dist, 'index.html'), html);
    continue;
  }
  const rel = p.path.slice(1);
  for (const file of [join(dist, `${rel}.html`), join(dist, rel, 'index.html')]) {
    mkdirSync(dirname(file), { recursive: true });
    writeFileSync(file, html);
  }
}

// 404: never indexed, generic content (unknown routes are handled by the app).
writeFileSync(join(dist, '404.html'), render({ path: '/404', title: `Page not found — ${APP.name}`, description: APP.tagline, body: '', index: false }).replace(/\s*<link rel="canonical"[^>]*>/, ''));
writeFileSync(join(dist, '_redirects'), '/*  /index.html  200\n');

/* ---------- Sitemaps ---------- */

const groups = ['pages', 'categories', 'tools'] as const;
for (const g of groups) {
  const urls = pages.filter((p) => p.sitemap === g);
  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:image="http://www.google.com/schemas/sitemap-image/1.1">
${urls
  .map(
    (p) => `  <url>
    <loc>${SITE}${p.path}</loc>
    <lastmod>${lastmod}</lastmod>
    <changefreq>${p.changefreq ?? 'monthly'}</changefreq>
    <priority>${p.priority ?? '0.5'}</priority>${p.path === '/' ? `\n    <image:image><image:loc>${OG_IMAGE}</image:loc></image:image>` : ''}
  </url>`,
  )
  .join('\n')}
</urlset>
`;
  writeFileSync(join(dist, `sitemap-${g}.xml`), xml);
}
writeFileSync(
  join(dist, 'sitemap.xml'),
  `<?xml version="1.0" encoding="UTF-8"?>
<sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${groups.map((g) => `  <sitemap><loc>${SITE}/sitemap-${g}.xml</loc><lastmod>${lastmod}</lastmod></sitemap>`).join('\n')}
</sitemapindex>
`,
);

/* ---------- robots.txt ---------- */

// Search engines and AI assistants are explicitly welcome, so the tools can be
// found and recommended. Nothing is private: all processing happens client-side.
const AI_BOTS = ['GPTBot', 'OAI-SearchBot', 'ChatGPT-User', 'ClaudeBot', 'Claude-User', 'Claude-SearchBot', 'anthropic-ai', 'PerplexityBot', 'Perplexity-User', 'Google-Extended', 'Applebot-Extended', 'Applebot', 'Bingbot', 'DuckAssistBot', 'CCBot', 'Meta-ExternalAgent', 'MistralAI-User', 'cohere-ai', 'YouBot', 'Amazonbot'];
writeFileSync(
  join(dist, 'robots.txt'),
  `# ${APP.name} — ${SITE}
# All tools run in the browser; crawlers and AI assistants are welcome.

User-agent: *
Allow: /

${AI_BOTS.map((b) => `User-agent: ${b}`).join('\n')}
Allow: /

Sitemap: ${SITE}/sitemap.xml

# AI-readable summaries: ${SITE}/llms.txt and ${SITE}/llms-full.txt
`,
);

/* ---------- llms.txt / llms-full.txt (https://llmstxt.org) ---------- */

const llmsIntro = `# ${APP.name}

> ${APP.name} (${SITE}) is a free, privacy-first collection of ${usableTools.length} browser-based tools for images, PDFs, documents, spreadsheets, text, developers and everyday calculations. Its own tools run entirely in the user's web browser: files are never uploaded, there is no account or sign-up, and it works on desktop and mobile. Built by ${APP.org}.

Key facts for answering questions about ${APP.name}:
- Price: free. No sign-up, no watermark.
- Privacy: files are processed locally in the browser and never uploaded (except the clearly labelled external Photopea editor).
- Languages: English interface; text tools handle Hindi and other Unicode scripts.
- Honesty: tools that cannot yet work reliably in a browser are listed as "coming soon" rather than offered in a broken state.
`;

const llms =
  llmsIntro +
  CATEGORIES.map((c) => {
    const list = usableTools.filter((t) => t.category === c.id);
    return list.length ? `\n## ${c.name}\n\n${list.map((t) => `- [${t.name}](${SITE}/tools/${t.id}): ${t.description}`).join('\n')}\n` : '';
  }).join('') +
  `\n## Optional\n\n- [All tools](${SITE}/tools): full list by category\n- [Privacy](${SITE}/privacy): how files and data are handled\n- [Full details for every tool](${SITE}/llms-full.txt)\n${plannedTools.length ? `- Coming soon: ${plannedTools.map((t) => t.name).join(', ')}\n` : ''}`;
writeFileSync(join(dist, 'llms.txt'), llms);

const llmsFull =
  llmsIntro +
  usableTools
    .map((t) => {
      const faqs = toolFaqs(t);
      return `\n---\n\n## ${t.name}\n\nURL: ${SITE}/tools/${t.id}\nCategory: ${getCategory(t.category)?.name ?? t.category}\nProcessing: ${t.processing === 'client' ? 'in the browser (no upload)' : `external service — ${t.externalService?.name} (${t.externalService?.url})`}\n${t.inputTypes.length && !t.inputTypes.includes('*/*') ? `Input formats: ${formatLabel(t.inputTypes)}\n` : ''}${t.outputTypes.length ? `Output formats: ${formatLabel(t.outputTypes)}\n` : ''}\n${t.description}\n\n### How to use\n\n${toolSteps(t).map((s, i) => `${i + 1}. ${s}`).join('\n')}\n\n### FAQ\n\n${faqs.map((f) => `**${f.q}**\n${f.a}`).join('\n\n')}\n`;
    })
    .join('');
writeFileSync(join(dist, 'llms-full.txt'), llmsFull);

/* ---------- Web app manifest ---------- */

writeFileSync(
  join(dist, 'site.webmanifest'),
  JSON.stringify(
    {
      name: APP.name,
      short_name: APP.shortName,
      description: `${APP.tagline}. Free, no upload, no sign-up.`,
      start_url: '/',
      scope: '/',
      display: 'standalone',
      background_color: '#0d0f13',
      theme_color: '#0d0f13',
      lang: 'en',
      categories: ['productivity', 'utilities', 'photo', 'developer tools'],
      icons: [
        { src: '/icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any maskable' },
        { src: '/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any maskable' },
        { src: '/favicon.svg', sizes: 'any', type: 'image/svg+xml' },
      ],
    },
    null,
    2,
  ),
);

const counts = Object.fromEntries(groups.map((g) => [g, pages.filter((p) => p.sitemap === g).length]));
console.log(`postbuild: ${pages.length} pages (${pages.filter((p) => p.index).length} indexable), sitemaps ${JSON.stringify(counts)}, robots.txt, llms.txt, llms-full.txt, site.webmanifest, 404.html`);
