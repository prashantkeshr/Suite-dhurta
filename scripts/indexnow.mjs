/**
 * Notify IndexNow-enabled search engines (Bing, Yandex, Seznam, Naver…) about
 * the site's URLs after a deploy. Reads the live sitemap index, so it only
 * submits what is actually published. Usage: node scripts/indexnow.mjs
 *
 * Google does not support IndexNow or sitemap pings; submit the sitemap once in
 * Google Search Console instead.
 */
import { readFileSync } from 'node:fs';

const config = readFileSync(new URL('../src/app/config.ts', import.meta.url), 'utf8');
const site = config.match(/siteUrl:\s*'([^']+)'/)?.[1]?.replace(/\/$/, '');
const key = config.match(/indexNowKey:\s*'([0-9a-f]{8,128})'/)?.[1];
if (!site || !key) {
  console.log('IndexNow: siteUrl or indexNowKey missing in config — skipping.');
  process.exit(0);
}

const host = new URL(site).host;
const locs = (xml) => [...xml.matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => m[1].trim());

async function get(url) {
  const res = await fetch(`${url}${url.includes('?') ? '&' : '?'}v=${Date.now()}`);
  if (!res.ok) throw new Error(`${url} → HTTP ${res.status}`);
  return res.text();
}

// Wait until the new deploy is live (the key file must be reachable).
for (let i = 0; i < 12; i++) {
  const ok = await fetch(`${site}/${key}.txt`).then((r) => r.ok).catch(() => false);
  if (ok) break;
  if (i === 11) {
    console.log('IndexNow: key file not reachable yet — skipping this run.');
    process.exit(0);
  }
  await new Promise((r) => setTimeout(r, 10_000));
}

const index = await get(`${site}/sitemap.xml`);
const sitemaps = locs(index);
const urls = [];
for (const sm of sitemaps) urls.push(...locs(await get(sm)));
const unique = [...new Set(urls)].filter((u) => u.startsWith(site));

const res = await fetch('https://api.indexnow.org/indexnow', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json; charset=utf-8' },
  body: JSON.stringify({ host, key, keyLocation: `${site}/${key}.txt`, urlList: unique.slice(0, 10_000) }),
});
console.log(`IndexNow: submitted ${unique.length} URLs → HTTP ${res.status} ${res.statusText}`);
// 200/202 = accepted; 422/403 usually mean the key file isn't live yet. Never fail the deploy over this.
process.exit(0);
