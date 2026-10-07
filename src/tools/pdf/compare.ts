/** Page-level text comparison for Compare PDFs (pure, unit-tested). */

/** Compare the text of each page; pages are kept apart so changes are easy to locate. */
export function pageSummary(a: string[], b: string[]): { page: number; status: 'changed' | 'only-a' | 'only-b' }[] {
  const out: { page: number; status: 'changed' | 'only-a' | 'only-b' }[] = [];
  const norm = (s: string) => s.replace(/\s+/g, ' ').trim();
  for (let i = 0; i < Math.max(a.length, b.length); i++) {
    if (i >= b.length) out.push({ page: i + 1, status: 'only-a' });
    else if (i >= a.length) out.push({ page: i + 1, status: 'only-b' });
    else if (norm(a[i]) !== norm(b[i])) out.push({ page: i + 1, status: 'changed' });
  }
  return out;
}

/** One text with page markers, so the line diff shows where each change is. */
export const joinPages = (p: string[]) => p.map((t, i) => `──── Page ${i + 1} ────\n${t.trim()}`).join('\n\n');
