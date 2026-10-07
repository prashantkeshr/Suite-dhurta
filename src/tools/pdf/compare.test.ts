import { describe, expect, it } from 'vitest';
import { pageSummary, joinPages } from './compare';

describe('PDF page comparison', () => {
  it('finds changed, added and removed pages, ignoring whitespace', () => {
    expect(pageSummary(['a  b', 'same', 'old'], ['a b', 'same', 'new', 'extra'])).toEqual([
      { page: 3, status: 'changed' },
      { page: 4, status: 'only-b' },
    ]);
    expect(pageSummary(['x', 'y'], ['x'])).toEqual([{ page: 2, status: 'only-a' }]);
    expect(pageSummary(['x'], ['x'])).toEqual([]);
  });
  it('marks pages in the combined text', () => {
    expect(joinPages(['one ', 'two'])).toBe('──── Page 1 ────\none\n\n──── Page 2 ────\ntwo');
  });
});
