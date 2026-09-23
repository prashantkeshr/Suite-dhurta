import { describe, expect, it } from 'vitest';
import { TOOLS, CATEGORIES, getTool, isUsable, toolsForFile, acceptsFile, relatedTools, formatLabel } from './index';
import { TOOL_LOADERS } from '../loaders';
import { hasIcon } from '@/components/ui/Icon';

describe('tool registry', () => {
  it('has unique ids', () => {
    const ids = TOOLS.map((t) => t.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('uses url-safe ids', () => {
    for (const t of TOOLS) expect(t.id).toMatch(/^[a-z0-9]+(-[a-z0-9]+)*$/);
  });

  it('gives every usable tool an implementation (no fake tools)', () => {
    const missing = TOOLS.filter((t) => isUsable(t) && !TOOL_LOADERS[t.id]).map((t) => t.id);
    expect(missing).toEqual([]);
  });

  it('never ships an implementation for a coming-soon tool', () => {
    const leaked = TOOLS.filter((t) => !isUsable(t) && TOOL_LOADERS[t.id]).map((t) => t.id);
    expect(leaked).toEqual([]);
  });

  it('has no loader without a registry entry', () => {
    expect(Object.keys(TOOL_LOADERS).filter((id) => !getTool(id))).toEqual([]);
  });

  it('explains why each planned tool is not available', () => {
    for (const t of TOOLS.filter((x) => !isUsable(x))) expect(t.reason, t.id).toBeTruthy();
  });

  it('labels external tools with their service', () => {
    for (const t of TOOLS.filter((x) => x.processing === 'external')) expect(t.externalService?.name, t.id).toBeTruthy();
  });

  it('references only known categories, icons and related tools', () => {
    const cats = new Set(CATEGORIES.map((c) => c.id));
    for (const t of TOOLS) {
      expect(cats.has(t.category), t.id).toBe(true);
      expect(hasIcon(t.icon), `${t.id} icon ${t.icon}`).toBe(true);
      for (const r of t.related ?? []) expect(getTool(r), `${t.id} → ${r}`).toBeDefined();
    }
    for (const c of CATEGORIES) expect(hasIcon(c.icon), c.id).toBe(true);
  });

  it('suggests image tools for a JPEG', () => {
    const ids = toolsForFile('image/jpeg', 'photo.jpg').map((t) => t.id);
    expect(ids).toEqual(expect.arrayContaining(['image-resizer', 'image-compressor', 'image-converter', 'image-to-pdf']));
    expect(ids).not.toContain('pdf-merge');
    // Specific tools come before generic any-file tools.
    expect(ids.indexOf('image-resizer')).toBeLessThan(ids.indexOf('file-info'));
  });

  it('suggests PDF tools for a PDF and only usable ones by default', () => {
    const tools = toolsForFile('application/pdf', 'doc.pdf');
    expect(tools.map((t) => t.id)).toEqual(expect.arrayContaining(['pdf-merge', 'pdf-split', 'pdf-rotate']));
    expect(tools.every(isUsable)).toBe(true);
    expect(toolsForFile('application/pdf', 'doc.pdf', { includePlanned: true }).some((t) => t.id === 'pdf-to-word')).toBe(true);
  });

  it('matches extension-based input types case-insensitively', () => {
    expect(acceptsFile(getTool('csv-to-json')!, 'text/plain', 'DATA.CSV')).toBe(true);
    expect(acceptsFile(getTool('csv-to-json')!, 'image/png', 'x.png')).toBe(false);
  });

  it('returns related tools without the tool itself', () => {
    const tool = getTool('image-resizer')!;
    const related = relatedTools(tool);
    expect(related.length).toBeGreaterThan(0);
    expect(related.find((t) => t.id === tool.id)).toBeUndefined();
  });

  it('formats type labels', () => {
    expect(formatLabel(['image/jpeg', 'image/png', '.csv'])).toBe('JPEG, PNG, CSV');
  });
});
