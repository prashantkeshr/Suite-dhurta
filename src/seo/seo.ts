/**
 * SEO and AI-discovery content derived from the tool registry. Pure functions
 * (no DOM), shared by the build-time page generator and the running app so the
 * structured data always matches what users see.
 *
 * Every statement is derived from registry fields, so claims stay honest:
 * e.g. "no upload" is only said for tools that process files locally.
 */
import { APP } from '@/app/config';
import type { ToolDefinition } from '@/types/tool';
import { getCategory, isUsable, formatLabel } from '@/tools/registry';

export const SITE = APP.siteUrl.replace(/\/$/, '');
export const OG_IMAGE = `${SITE}/og.jpg`;

const takesFiles = (t: ToolDefinition) => t.inputTypes.length > 0;
const isLocal = (t: ToolDefinition) => t.processing === 'client';

/** Title tag: keyword first, honest qualifiers, brand last. */
export function toolTitle(t: ToolDefinition): string {
  if (!isUsable(t)) return `${t.name} (Coming Soon) | ${APP.name}`;
  if (!isLocal(t)) return `${t.name} — Free Online | ${APP.name}`;
  if (takesFiles(t)) return `${t.name} — Free, Private, No Upload | ${APP.name}`;
  return `${t.name} — Free Online Tool | ${APP.name}`;
}

const clip = (s: string, n = 160) => (s.length <= n ? s : s.slice(0, n - 1).replace(/\s+\S*$/, '') + '…');

export function toolDescription(t: ToolDefinition): string {
  if (!isUsable(t)) return clip(`${t.name} is coming soon to ${APP.name}. ${t.description}`);
  if (!isLocal(t)) return clip(`${t.description} Free, no sign-up. Runs on ${t.externalService?.name ?? 'an external service'}.`);
  const privacy = takesFiles(t) ? 'Files never leave your device — no upload, no sign-up.' : 'Free, no sign-up, works right in your browser.';
  return clip(`${t.description} ${privacy}`);
}

export interface Faq {
  q: string;
  a: string;
}

/** Frequently asked questions for a tool, built only from facts in the registry. */
export function toolFaqs(t: ToolDefinition): Faq[] {
  if (!isUsable(t)) return [];
  const faqs: Faq[] = [{ q: `Is ${t.name} free?`, a: `Yes. ${t.name} is free to use and needs no account or sign-up.` }];
  if (isLocal(t)) {
    faqs.push(
      takesFiles(t)
        ? { q: 'Are my files uploaded to a server?', a: `No. ${APP.name} processes your files inside your own browser. They are not uploaded, stored or seen by anyone, and they are discarded when you close the page.` }
        : { q: 'Is my data sent anywhere?', a: `No. Everything you enter is processed inside your browser and is not sent to a server.` },
    );
  } else if (t.externalService) {
    faqs.push({
      q: `Is ${t.externalService.name} part of ${APP.name}?`,
      a: `No. ${t.externalService.name} is a separate web service (${t.externalService.url}) shown inside ${APP.name}. It loads only after you agree, shows its own advertising, and its own privacy policy applies.`,
    });
  }
  if (takesFiles(t) && !t.inputTypes.includes('*/*')) {
    const out = t.outputTypes.length ? ` Results can be saved as ${formatLabel(t.outputTypes)}.` : '';
    faqs.push({ q: 'Which file formats are supported?', a: `${t.name} accepts ${formatLabel(t.inputTypes)}.${out}` });
  }
  if (t.batch) faqs.push({ q: 'Can I process several files at once?', a: 'Yes. Add as many files as you like; results can be downloaded one by one or together as a ZIP.' });
  faqs.push(
    t.offline === 'yes'
      ? { q: 'Does it work offline?', a: 'Once the page has loaded, processing needs no internet connection.' }
      : { q: 'Does it need an internet connection?', a: 'Yes, this tool needs an internet connection.' },
  );
  faqs.push({
    q: 'Does it work on phones?',
    a: t.limitations?.some((l) => /desktop or tablet/i.test(l)) ? 'It works in mobile browsers, but a desktop or tablet gives the best experience.' : 'Yes. It works in current mobile browsers on Android and iPhone, as well as on desktop.',
  });
  if (t.limitations?.length) faqs.push({ q: 'Are there any limitations?', a: t.limitations.join(' ') });
  return faqs;
}

/** Short how-to steps matching the tool's kind of input. */
export function toolSteps(t: ToolDefinition): string[] {
  if (!isUsable(t)) return [];
  if (!isLocal(t)) {
    return [`Open ${t.name} and choose “Load ${t.externalService?.name ?? 'the editor'}”.`, 'Open your image with “Open image”, or start a new document.', 'Edit with layers, filters and adjustments.', 'Save as PNG, JPG, WebP or PSD.'];
  }
  if (takesFiles(t)) {
    return [
      `Drop your ${t.inputTypes.includes('*/*') ? '' : formatLabel(t.inputTypes) + ' '}file${t.batch ? 's' : ''} onto the page, or choose ${t.batch ? 'them' : 'it'} from your device.`,
      'Adjust the options if needed.',
      `Start ${t.actionLabel ? `“${t.actionLabel}”` : 'processing'} — it runs inside your browser.`,
      'Preview the result and download it.',
    ];
  }
  if (t.category === 'calculators' || t.category === 'converters') return ['Enter your values.', 'The result updates instantly, with the formula shown.', 'Copy the result if you need it.'];
  if (t.intents.includes('create')) return ['Choose the options you want.', 'The result is generated instantly in your browser.', 'Copy it or download it.'];
  return ['Type or paste your text, or open a file.', 'Choose the options you want.', 'Copy or download the result.'];
}

/* ---------- JSON-LD ---------- */

type Json = Record<string, unknown>;

export const organizationLd = (): Json => ({
  '@context': 'https://schema.org',
  '@type': 'Organization',
  '@id': `${SITE}/#organization`,
  name: APP.org,
  url: SITE,
  logo: `${SITE}/icon-512.png`,
});

export const websiteLd = (): Json => ({
  '@context': 'https://schema.org',
  '@type': 'WebSite',
  '@id': `${SITE}/#website`,
  name: APP.name,
  alternateName: APP.shortName,
  url: `${SITE}/`,
  description: `${APP.tagline}. Image, PDF, text, data and developer tools that run in your browser — free, no upload, no sign-up.`,
  inLanguage: 'en',
  publisher: { '@id': `${SITE}/#organization` },
  potentialAction: {
    '@type': 'SearchAction',
    target: { '@type': 'EntryPoint', urlTemplate: `${SITE}/tools?q={search_term_string}` },
    'query-input': 'required name=search_term_string',
  },
});

export function breadcrumbLd(items: { name: string; path: string }[]): Json {
  return {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: items.map((it, i) => ({ '@type': 'ListItem', position: i + 1, name: it.name, item: `${SITE}${it.path}` })),
  };
}

const APP_CATEGORY: Record<string, string> = {
  image: 'MultimediaApplication',
  pdf: 'BusinessApplication',
  documents: 'BusinessApplication',
  spreadsheets: 'BusinessApplication',
  presentations: 'BusinessApplication',
  text: 'UtilitiesApplication',
  developer: 'DeveloperApplication',
  security: 'SecurityApplication',
  generators: 'DesignApplication',
  calculators: 'FinanceApplication',
  converters: 'UtilitiesApplication',
  files: 'UtilitiesApplication',
};

export function webApplicationLd(t: ToolDefinition): Json {
  return {
    '@context': 'https://schema.org',
    '@type': 'WebApplication',
    '@id': `${SITE}/tools/${t.id}#app`,
    name: t.name,
    url: `${SITE}/tools/${t.id}`,
    description: t.description,
    applicationCategory: APP_CATEGORY[t.category] ?? 'UtilitiesApplication',
    operatingSystem: 'Any (runs in a web browser)',
    browserRequirements: 'Requires JavaScript and a current version of Chrome, Edge, Firefox, Safari or Opera.',
    isAccessibleForFree: true,
    offers: { '@type': 'Offer', price: '0', priceCurrency: 'INR' },
    inLanguage: 'en',
    ...(t.keywords.length ? { keywords: t.keywords.join(', ') } : {}),
    ...(isLocal(t) && takesFiles(t) ? { featureList: ['Runs entirely in your browser', 'No file upload', 'No account required', ...(t.batch ? ['Batch processing'] : [])] } : {}),
    publisher: { '@id': `${SITE}/#organization` },
    isPartOf: { '@id': `${SITE}/#website` },
  };
}

export function faqLd(faqs: Faq[]): Json | null {
  if (!faqs.length) return null;
  return {
    '@context': 'https://schema.org',
    '@type': 'FAQPage',
    mainEntity: faqs.map((f) => ({ '@type': 'Question', name: f.q, acceptedAnswer: { '@type': 'Answer', text: f.a } })),
  };
}

export function howToLd(t: ToolDefinition, steps: string[]): Json | null {
  if (!steps.length) return null;
  return {
    '@context': 'https://schema.org',
    '@type': 'HowTo',
    name: `How to use ${t.name}`,
    tool: { '@type': 'HowToTool', name: `${APP.name} ${t.name}` },
    estimatedCost: { '@type': 'MonetaryAmount', currency: 'INR', value: '0' },
    step: steps.map((s, i) => ({ '@type': 'HowToStep', position: i + 1, text: s })),
  };
}

export function collectionLd(categoryId: string, tools: ToolDefinition[]): Json {
  const c = getCategory(categoryId)!;
  return {
    '@context': 'https://schema.org',
    '@type': 'CollectionPage',
    name: `${c.name} tools`,
    url: `${SITE}/category/${c.id}`,
    description: c.description,
    isPartOf: { '@id': `${SITE}/#website` },
    mainEntity: {
      '@type': 'ItemList',
      numberOfItems: tools.length,
      itemListElement: tools.map((t, i) => ({ '@type': 'ListItem', position: i + 1, url: `${SITE}/tools/${t.id}`, name: t.name })),
    },
  };
}

/** All structured data for a tool page. */
export function toolJsonLd(t: ToolDefinition): Json[] {
  const cat = getCategory(t.category);
  const out: (Json | null)[] = [
    breadcrumbLd([{ name: 'Home', path: '/' }, ...(cat ? [{ name: cat.name, path: `/category/${cat.id}` }] : []), { name: t.name, path: `/tools/${t.id}` }]),
  ];
  if (isUsable(t)) out.push(webApplicationLd(t), faqLd(toolFaqs(t)), howToLd(t, toolSteps(t)));
  return out.filter((x): x is Json => !!x);
}

