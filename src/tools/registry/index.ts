import type { CategoryId, Intent, ToolDefinition, ToolStatus } from '@/types/tool';
import { imageTools } from './image';
import { pdfTools } from './pdf';
import { textTools } from './text';
import { developerTools } from './developer';
import { securityTools, dataTools, calculatorTools, fileTools } from './misc';

export interface Category {
  id: CategoryId;
  name: string;
  description: string;
  icon: string;
}

export const CATEGORIES: Category[] = [
  { id: 'image', name: 'Images', description: 'Resize, convert, compress and inspect images.', icon: 'Image' },
  { id: 'pdf', name: 'PDF', description: 'Merge, split, rotate and inspect PDF files.', icon: 'FileText' },
  { id: 'documents', name: 'Documents', description: 'Markdown, text and document conversion.', icon: 'FileType' },
  { id: 'spreadsheets', name: 'Data & Spreadsheets', description: 'CSV and JSON conversion and viewing.', icon: 'Sheet' },
  { id: 'presentations', name: 'Presentations', description: 'Slide and presentation utilities.', icon: 'Presentation' },
  { id: 'text', name: 'Text', description: 'Count, clean, transform and generate text.', icon: 'Type' },
  { id: 'developer', name: 'Developer', description: 'JSON, encoding, URLs, regex and colours.', icon: 'Code' },
  { id: 'security', name: 'Security & Privacy', description: 'Passwords, hashes, UUIDs and tokens.', icon: 'ShieldCheck' },
  { id: 'generators', name: 'Generators', description: 'QR codes, barcodes, gradients and more.', icon: 'Sparkles' },
  { id: 'calculators', name: 'Calculators', description: 'Percentages, GST, EMI and more, with formulas shown.', icon: 'Calculator' },
  { id: 'converters', name: 'Unit Converters', description: 'Convert between units of measurement.', icon: 'Ruler' },
  { id: 'files', name: 'File Utilities', description: 'File type detection, hashing and ZIP archives.', icon: 'Folder' },
];

export const TOOLS: ToolDefinition[] = [
  ...imageTools,
  ...pdfTools,
  ...textTools,
  ...developerTools,
  ...securityTools,
  ...dataTools,
  ...calculatorTools,
  ...fileTools,
];

const byId = new Map(TOOLS.map((t) => [t.id, t]));

export const getTool = (id: string) => byId.get(id);
export const getCategory = (id: string) => CATEGORIES.find((c) => c.id === id);

/** Tools a user can actually run right now. */
export const isUsable = (t: ToolDefinition) => t.status === 'available' || t.status === 'beta' || t.status === 'limited';

const statusOrder: Record<ToolStatus, number> = { available: 0, beta: 1, limited: 2, 'coming-soon': 3, unavailable: 4 };
export const sortTools = (list: ToolDefinition[]) =>
  [...list].sort((a, b) => statusOrder[a.status] - statusOrder[b.status] || a.name.localeCompare(b.name));

export const toolsInCategory = (id: CategoryId) => sortTools(TOOLS.filter((t) => t.category === id));
export const toolsForIntent = (intent: Intent) => sortTools(TOOLS.filter((t) => t.intents.includes(intent) && isUsable(t)));
export const popularTools = () => TOOLS.filter((t) => t.popular && isUsable(t));

export function relatedTools(tool: ToolDefinition, max = 4): ToolDefinition[] {
  const explicit = (tool.related ?? []).map(getTool).filter((t): t is ToolDefinition => !!t);
  const sameCategory = TOOLS.filter((t) => t.category === tool.category && t.id !== tool.id && isUsable(t));
  const seen = new Set<string>([tool.id]);
  const out: ToolDefinition[] = [];
  for (const t of [...explicit, ...sameCategory]) {
    if (seen.has(t.id)) continue;
    seen.add(t.id);
    out.push(t);
    if (out.length >= max) break;
  }
  return out;
}

/** Does the tool accept a file with this MIME type and file name? */
export function acceptsFile(tool: ToolDefinition, mime: string, name: string): boolean {
  if (tool.inputTypes.length === 0) return false;
  const lower = name.toLowerCase();
  return tool.inputTypes.some((type) => {
    if (type === '*/*') return true;
    if (type.startsWith('.')) return lower.endsWith(type);
    if (type.endsWith('/*')) return mime.startsWith(type.slice(0, -1));
    return mime === type;
  });
}

/**
 * Tools that can act on a given file, specific tools first. Generic tools that
 * accept any file (hash, zip, file info) are listed last.
 */
export function toolsForFile(mime: string, name: string, opts: { includePlanned?: boolean } = {}): ToolDefinition[] {
  const matches = TOOLS.filter((t) => acceptsFile(t, mime, name) && (opts.includePlanned || isUsable(t)));
  const generic = (t: ToolDefinition) => t.inputTypes.includes('*/*');
  return [...matches.filter((t) => !generic(t)), ...matches.filter(generic)].sort((a, b) => {
    const ga = generic(a) ? 1 : 0;
    const gb = generic(b) ? 1 : 0;
    if (ga !== gb) return ga - gb;
    return statusOrder[a.status] - statusOrder[b.status];
  });
}

/** Browser `accept` attribute for a tool's file input. */
export function acceptAttribute(tool: ToolDefinition): string | undefined {
  if (tool.inputTypes.includes('*/*') || tool.inputTypes.length === 0) return undefined;
  return tool.inputTypes.join(',');
}

/** Human readable format list, e.g. "JPEG, PNG, WebP". */
export function formatLabel(types: string[]): string {
  const map: Record<string, string> = {
    'image/jpeg': 'JPEG',
    'image/png': 'PNG',
    'image/webp': 'WebP',
    'image/gif': 'GIF',
    'image/bmp': 'BMP',
    'image/avif': 'AVIF',
    'image/svg+xml': 'SVG',
    'image/heic': 'HEIC',
    'image/heif': 'HEIF',
    'application/pdf': 'PDF',
    'image/vnd.adobe.photoshop': 'PSD',
    'image/x-icon': 'ICO',
    'application/json': 'JSON',
    'application/zip': 'ZIP',
    'text/csv': 'CSV',
    'text/tab-separated-values': 'TSV',
    'text/plain': 'Text',
    'text/markdown': 'Markdown',
    'application/xml': 'XML',
    '*/*': 'Any file',
  };
  const labels = types.map((t) => map[t] ?? (t.startsWith('.') ? t.slice(1).toUpperCase() : t));
  return [...new Set(labels)].join(', ');
}
