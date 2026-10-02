import { describe, expect, it } from 'vitest';
import { TASKS, getTask } from './tasks';
import { TOOLS, getTool, isUsable } from '@/tools/registry';
import { TOOL_LOADERS } from '@/tools/loaders';

const APP_ROUTES = ['tools', 'category', 'workspace', 'history', 'settings', 'diagnostics', 'privacy', 'about', 'hi', 'assets', 'brand', 'share-target', 'open'];

describe('task landing pages', () => {
  it('have unique slugs that never clash with app routes or tool ids', () => {
    const slugs = TASKS.map((t) => t.slug);
    expect(new Set(slugs).size).toBe(slugs.length);
    for (const s of slugs) {
      expect(s, s).toMatch(/^(hi\/)?[a-z0-9]+(-[a-z0-9]+)*$/);
      expect(APP_ROUTES).not.toContain(s);
      expect(TOOLS.some((t) => t.id === s), `${s} duplicates a tool page`).toBe(false);
    }
  });

  it('only point at tools that really work', () => {
    for (const t of TASKS) {
      const tool = getTool(t.toolId);
      expect(tool && isUsable(tool) && !!TOOL_LOADERS[tool.id], `${t.slug} → ${t.toolId}`).toBe(true);
    }
  });

  it('have search-friendly titles and descriptions, and their own content', () => {
    const intros = new Set<string>();
    for (const t of TASKS) {
      expect(t.title.length, t.slug).toBeLessThanOrEqual(70);
      expect(t.description.length, t.slug).toBeGreaterThan(60);
      expect(t.description.length, t.slug).toBeLessThanOrEqual(175);
      expect(t.steps.length, t.slug).toBeGreaterThanOrEqual(3);
      expect(t.faqs.length, t.slug).toBeGreaterThanOrEqual(1);
      expect(intros.has(t.intro), `${t.slug} copies another page`).toBe(false);
      intros.add(t.intro);
      expect(t.lang === 'hi', t.slug).toBe(t.slug.startsWith('hi/'));
    }
  });

  it('pair language versions both ways', () => {
    for (const t of TASKS.filter((x) => x.twin)) {
      const twin = getTask(t.twin!);
      expect(twin, `${t.slug} → ${t.twin}`).toBeDefined();
      expect(twin!.twin, `${t.twin} should point back to ${t.slug}`).toBe(t.slug);
      expect(twin!.lang).not.toBe(t.lang);
      expect(twin!.toolId).toBe(t.toolId);
    }
  });

  it('link only to existing pages', () => {
    for (const t of TASKS) for (const r of t.related ?? []) expect(getTask(r), `${t.slug} → ${r}`).toBeDefined();
  });
});
