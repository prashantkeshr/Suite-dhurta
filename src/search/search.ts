import type { ToolDefinition } from '@/types/tool';
import { TOOLS, getCategory, formatLabel, isUsable } from '@/tools/registry';

/**
 * Lightweight tool search. Every query word must match somewhere in a tool
 * (name, alias, keyword, category, file type or description); matches in the
 * name score highest. No dependency — the registry is small enough.
 */

const SYNONYMS: Record<string, string[]> = {
  jpg: ['jpeg'],
  jpeg: ['jpg'],
  photo: ['image'],
  picture: ['image'],
  pic: ['image'],
  shrink: ['compress', 'resize'],
  reduce: ['compress'],
  smaller: ['compress'],
  combine: ['merge'],
  join: ['merge'],
  excel: ['xlsx', 'spreadsheet'],
  word: ['docx'],
  sha: ['hash'],
  encrypt: ['password', 'protect'],
};

interface Indexed {
  tool: ToolDefinition;
  name: string;
  aliases: string;
  keywords: string;
  meta: string;
  description: string;
}

const norm = (s: string) => s.toLowerCase().normalize('NFKD').replace(/[̀-ͯ]/g, '').replace(/[→>]/g, ' to ');

let index: Indexed[] | null = null;
function getIndex(): Indexed[] {
  if (!index) {
    index = TOOLS.map((tool) => ({
      tool,
      name: norm(tool.name),
      aliases: norm((tool.aliases ?? []).join(' | ')),
      keywords: norm(tool.keywords.join(' | ')),
      meta: norm(
        [getCategory(tool.category)?.name ?? '', tool.category, formatLabel(tool.inputTypes), formatLabel(tool.outputTypes), tool.actionLabel ?? ''].join(' '),
      ),
      description: norm(tool.description),
    }));
  }
  return index;
}

function wordScore(entry: Indexed, word: string): number {
  const variants = [word, ...(SYNONYMS[word] ?? [])];
  let best = 0;
  for (const w of variants) {
    const synonymPenalty = w === word ? 1 : 0.8;
    const startsWord = (s: string) => new RegExp(`(^|[^a-z0-9])${w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`).test(s);
    let s = 0;
    if (entry.name.includes(w)) s = startsWord(entry.name) ? 10 : 6;
    else if (entry.aliases.includes(w)) s = startsWord(entry.aliases) ? 8 : 5;
    else if (entry.keywords.includes(w)) s = startsWord(entry.keywords) ? 6 : 3;
    else if (entry.meta.includes(w)) s = 4;
    else if (entry.description.includes(w)) s = startsWord(entry.description) ? 2 : 1;
    best = Math.max(best, s * synonymPenalty);
  }
  return best;
}

export interface SearchResult {
  tool: ToolDefinition;
  score: number;
}

export function searchTools(query: string, limit = 20): SearchResult[] {
  const words = norm(query)
    .split(/[\s,/]+/)
    .filter((w) => w && w !== 'to' && w !== 'a' && w !== 'the');
  if (words.length === 0) return [];
  const index = getIndex();
  const scores = index.map((entry) => words.map((w) => wordScore(entry, w)));
  // Rare words ("compress") say more about intent than common ones ("image").
  const idf = words.map((_, wi) => {
    const df = scores.filter((s) => s[wi] > 0).length;
    return df ? 1 + Math.log(index.length / df) : 0;
  });
  const rarest = idf.indexOf(Math.max(...idf));

  const full: SearchResult[] = [];
  const partial: SearchResult[] = [];
  index.forEach((entry, i) => {
    const s = scores[i];
    const matched = s.filter((x) => x > 0).length;
    if (matched === 0) return;
    let total = s.reduce((acc, x, wi) => acc + x * idf[wi], 0);
    if (entry.name === norm(query).trim()) total += 50;
    // Usable tools rank above planned ones with a similar score.
    if (isUsable(entry.tool)) total += 5;
    if (matched === words.length) full.push({ tool: entry.tool, score: total });
    // Near misses that strongly match the most distinctive word ("compress image" → Compress PDF);
    // >= 8 means a word-start hit in the name or an alias, not a substring like "pass|word".
    else if (words.length > 1 && s[rarest] >= 8) partial.push({ tool: entry.tool, score: total });
  });
  const byScore = (a: SearchResult, b: SearchResult) => b.score - a.score || a.tool.name.localeCompare(b.tool.name);
  full.sort(byScore);
  const extra = full.length < 6 ? partial.sort(byScore).slice(0, 6 - full.length) : [];
  return [...full, ...extra].slice(0, limit);
}
