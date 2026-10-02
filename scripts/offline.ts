/**
 * Offline support, generated after the build (called from postbuild.ts).
 *
 * Works out from Vite's module graph (dist/.vite/manifest.json):
 *   - the app shell: the entry, the pages and everything they statically need;
 *   - for every tool, the extra files it needs (its chunk, libraries it imports
 *     on demand, and workers/WASM it references by URL).
 * Writes dist/offline.json (read by the app to show honest per-tool offline
 * status) and dist/sw.js (the service worker) with that file list baked in.
 */
import { createHash } from 'node:crypto';
import { existsSync, readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

interface Chunk {
  file: string;
  src?: string;
  imports?: string[];
  dynamicImports?: string[];
  css?: string[];
  assets?: string[];
}

export interface OfflineManifest {
  version: string;
  shell: string[];
  tools: Record<string, { files: string[]; bytes: number }>;
  /** Every cacheable file in this build (used to prune old entries). */
  all: string[];
  totalBytes: number;
}

/** tool id → source module, read from src/tools/loaders.ts. */
export function toolModules(loadersSource: string): Record<string, string> {
  const named: Record<string, string> = {};
  for (const m of loadersSource.matchAll(/const (\w+): Loader = \(\) => import\('\.\/([^']+)'\)/g)) named[m[1]] = m[2];
  const out: Record<string, string> = {};
  const body = loadersSource.slice(loadersSource.indexOf('TOOL_LOADERS'));
  for (const m of body.matchAll(/'([\w-]+)': (?:(\w+)|\(\) => import\('\.\/([^']+)'\))/g)) {
    const path = m[3] ?? named[m[2]];
    if (path) out[m[1]] = `src/tools/${path}`;
  }
  return out;
}

export function buildOffline(dist: string, base: string, loadersSource: string, swTemplate: string): OfflineManifest {
  const manifest: Record<string, Chunk> = JSON.parse(readFileSync(join(dist, '.vite', 'manifest.json'), 'utf8'));
  const keyFor = (src: string) => Object.keys(manifest).find((k) => k === `${src}.tsx` || k === `${src}.ts`);

  const assetsDir = join(dist, 'assets');
  // Chunks in the module graph are followed through the graph; a text scan only
  // picks up the rest (workers, WASM), because entry chunks also list every lazy
  // chunk's file name for preloading.
  const graphFiles = new Set(Object.values(manifest).flatMap((c) => [c.file, ...(c.css ?? [])]));
  const assetFiles = readdirSync(assetsDir).map((f) => `assets/${f}`).filter((f) => !graphFiles.has(f));
  const size = (f: string) => statSync(join(dist, f)).size;
  const textCache = new Map<string, string>();
  const text = (f: string) => {
    if (!textCache.has(f)) textCache.set(f, /\.(m?js|css)$/.test(f) ? readFileSync(join(dist, f), 'utf8') : '');
    return textCache.get(f)!;
  };

  /** Files reachable from a manifest key. `follow` decides which dynamic imports to enter. */
  function closure(start: string[], follow: (key: string) => boolean, stop: (key: string) => boolean = () => false): Set<string> {
    const files = new Set<string>();
    const seen = new Set<string>();
    const stack = [...start];
    while (stack.length) {
      const key = stack.pop()!;
      if (seen.has(key)) continue;
      seen.add(key);
      const c = manifest[key];
      if (!c || stop(key)) continue;
      files.add(c.file);
      c.css?.forEach((f) => files.add(f));
      c.assets?.forEach((f) => files.add(f));
      c.imports?.forEach((k) => stack.push(k));
      c.dynamicImports?.filter(follow).forEach((k) => stack.push(k));
    }
    // Workers, WASM and other files referenced by URL inside the chunks.
    const queue = [...files];
    while (queue.length) {
      const f = queue.pop()!;
      const body = text(f);
      if (!body) continue;
      for (const a of assetFiles) {
        if (files.has(a)) continue;
        const name = a.slice('assets/'.length);
        if (body.includes(name)) {
          files.add(a);
          queue.push(a);
        }
      }
    }
    return files;
  }

  // App shell: entry + pages; tool modules and on-demand libraries are left out.
  const shellChunks = closure(['index.html'], (k) => !k.startsWith('src/tools/') && !k.startsWith('node_modules/'));
  const publicShell = ['', 'index.html', 'site.webmanifest', 'offline.json', 'favicon.ico', 'favicon-16.png', 'favicon-32.png', 'icon-180.png', 'icon-192.png', 'icon-512.png', 'icon-maskable-192.png', 'icon-maskable-512.png', 'brand/logo-light.png', 'brand/logo-dark.png', 'brand/badge-light.png', 'brand/badge-dark.png', 'brand/mark-light.png', 'brand/mark-dark.png'].filter((f) => f === '' || f === 'offline.json' || existsSync(join(dist, f)));
  const shell = [...publicShell, ...[...shellChunks].sort()];

  const tools: OfflineManifest['tools'] = {};
  for (const [id, src] of Object.entries(toolModules(loadersSource))) {
    const key = keyFor(src);
    if (!key) throw new Error(`offline: no build chunk for tool "${id}" (${src})`);
    // Stop at shell chunks: tools import the entry, whose lazy imports lead to every other tool.
    const files = [...closure([key], () => true, (k) => shellChunks.has(manifest[k].file))].filter((f) => !shellChunks.has(f)).sort();
    tools[id] = { files, bytes: files.reduce((a, f) => a + size(f), 0) };
  }

  const all = [...new Set([...shell, ...Object.values(tools).flatMap((t) => t.files)])];
  const hash = createHash('sha256');
  for (const f of all) hash.update(f);
  hash.update(readFileSync(join(dist, 'index.html')));
  hash.update(swTemplate);
  const version = hash.digest('hex').slice(0, 12);
  const totalBytes = all.filter((f) => f.startsWith('assets/')).reduce((a, f) => a + size(f), 0);

  const result: OfflineManifest = { version, shell, tools, all, totalBytes };
  writeFileSync(join(dist, 'offline.json'), JSON.stringify(result));

  const url = (f: string) => base + f;
  writeFileSync(
    join(dist, 'sw.js'),
    swTemplate
      .replace('__VERSION__', version)
      .replace('__BASE__', base)
      .replace('"__SHELL__"', JSON.stringify(shell.map(url)))
      .replace('"__ALL__"', JSON.stringify(all.map(url))),
  );
  return result;
}
