import { describe, expect, it } from 'vitest';
import { TOOLS, getTool, isUsable } from '@/tools/registry';
import { toolTitle, toolDescription, toolFaqs, toolSteps, toolJsonLd, websiteLd } from './seo';

describe('SEO content', () => {
  it('only claims "no upload" for tools that process files locally', () => {
    for (const t of TOOLS.filter(isUsable)) {
      const text = [toolTitle(t), toolDescription(t), ...toolFaqs(t).map((f) => f.a)].join(' ');
      if (t.processing === 'external') expect(text, t.id).not.toMatch(/no upload|never leave your device|not uploaded/i);
    }
    const photopea = getTool('photopea')!;
    expect(toolFaqs(photopea).some((f) => /separate web service/.test(f.a))).toBe(true);
  });

  it('keeps titles and descriptions within search-result limits', () => {
    for (const t of TOOLS) {
      expect(toolTitle(t).length, t.id).toBeLessThanOrEqual(75);
      expect(toolDescription(t).length, t.id).toBeLessThanOrEqual(160);
      expect(toolDescription(t).length, t.id).toBeGreaterThan(50);
    }
  });

  it('gives every usable tool steps and FAQs, and planned tools none', () => {
    for (const t of TOOLS) {
      if (isUsable(t)) {
        expect(toolSteps(t).length, t.id).toBeGreaterThanOrEqual(3);
        expect(toolFaqs(t).length, t.id).toBeGreaterThanOrEqual(3);
      } else {
        expect(toolSteps(t)).toEqual([]);
        expect(toolFaqs(t)).toEqual([]);
        expect(toolTitle(t)).toMatch(/Coming Soon/);
      }
    }
  });

  it('produces valid structured data', () => {
    const ld = toolJsonLd(getTool('pdf-merge')!);
    const types = ld.map((x) => x['@type']);
    expect(types).toEqual(['BreadcrumbList', 'WebApplication', 'FAQPage', 'HowTo']);
    const app = ld[1] as Record<string, unknown>;
    expect(app).toMatchObject({ isAccessibleForFree: true, offers: { price: '0' } });
    expect(String(app.url)).toMatch(/\/tools\/pdf-merge$/);
    // Planned tools only get a breadcrumb.
    expect(toolJsonLd(getTool('pdf-to-word')!).map((x) => x['@type'])).toEqual(['BreadcrumbList']);
    expect(JSON.stringify(websiteLd())).toContain('/tools?q={search_term_string}');
  });

  it('mentions supported formats in the FAQ for file tools', () => {
    const faqs = toolFaqs(getTool('image-compressor')!);
    expect(faqs.find((f) => /formats/.test(f.q))?.a).toMatch(/JPEG/);
  });
});
