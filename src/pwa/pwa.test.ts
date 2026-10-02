import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { missingFiles, isToolReady, filesFor, type OfflineManifest } from './offlineFiles';
import { toolModules } from '../../scripts/offline';
import { TOOLS, isUsable } from '@/tools/registry';

const m: OfflineManifest = {
  version: 'v1',
  shell: ['', 'index.html', 'assets/index-a.js', 'assets/index-a.css'],
  tools: {
    'pdf-merge': { files: ['assets/PdfMerge-b.js', 'assets/pdf-c.js'], bytes: 10 },
    'pdf-split': { files: ['assets/PdfPages-d.js', 'assets/pdf-c.js'], bytes: 8 },
  },
  all: [],
  totalBytes: 18,
};

describe('offline file lists', () => {
  it('needs the shell code and the tool files', () => {
    expect(missingFiles(m, 'pdf-merge', new Set(['/assets/index-a.js']))).toEqual(['assets/index-a.css', 'assets/PdfMerge-b.js', 'assets/pdf-c.js']);
    const all = new Set(['/assets/index-a.js', '/assets/index-a.css', '/assets/PdfMerge-b.js', '/assets/pdf-c.js']);
    expect(isToolReady(m, 'pdf-merge', all)).toBe(true);
    expect(isToolReady(m, 'pdf-split', all)).toBe(false);
    expect(isToolReady(m, 'unknown-tool', all)).toBe(false);
  });
  it('respects a sub-path base', () => {
    expect(missingFiles(m, 'pdf-merge', new Set(['/suite/assets/index-a.js', '/suite/assets/index-a.css', '/suite/assets/PdfMerge-b.js', '/suite/assets/pdf-c.js']), '/suite/')).toEqual([]);
  });
  it('de-duplicates shared files', () => {
    expect(filesFor(m, ['pdf-merge', 'pdf-split']).filter((f) => f === 'assets/pdf-c.js')).toHaveLength(1);
  });
});

describe('tool → module map used by the build', () => {
  const map = toolModules(readFileSync(join(process.cwd(), 'src/tools/loaders.ts'), 'utf8'));
  it('resolves every usable tool, including shared loaders', () => {
    for (const t of TOOLS.filter(isUsable)) expect(map[t.id], t.id).toMatch(/^src\/tools\//);
    expect(map['image-resizer']).toBe('src/tools/image/ImageBatchTool');
    expect(map['qr-generator']).toBe('src/tools/generators/QrGeneratorTool');
  });
  it('lists no coming-soon tools', () => {
    for (const t of TOOLS.filter((x) => !isUsable(x))) expect(map[t.id], t.id).toBeUndefined();
  });
});
