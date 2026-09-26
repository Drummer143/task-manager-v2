import { describe, expect, it } from 'vitest';
import { filterByLabel, matchLabel } from './matchLabel';

const bold = (label: string, query: string) =>
  matchLabel(label, query)
    .segments.map((segment) => (segment.match ? `[${segment.text}]` : segment.text))
    .join('');

describe('matchLabel', () => {
  it('ranks the start of a word over a substring over letters in order', () => {
    expect(matchLabel('Move task to Done', 'task').score).toBe(3);
    expect(matchLabel('Move task to Done', 'ask').score).toBe(2);
    expect(matchLabel('Move to Done', 'mvd').score).toBe(1);
    expect(matchLabel('Move to Done', 'xyz').score).toBe(0);
  });

  it('marks what matched, for bold', () => {
    expect(bold('Move task to Done', 'to')).toBe('Move task [to] Done');
    expect(bold('Hotkey registry', 'key')).toBe('Hot[key] registry');
    expect(bold('Move to Done', 'mvd')).toBe('[M]o[v]e to [D]one');
  });

  it('ignores case and surrounding spaces; an empty query matches everything plainly', () => {
    expect(bold('Q3 board', ' Q3 ')).toBe('[Q3] board');
    expect(matchLabel('Anything', '').score).toBe(3);
    expect(bold('Anything', '')).toBe('Anything');
  });

  it('treats regex characters in the query as text', () => {
    expect(matchLabel('Show (all) tasks', '(all').score).toBe(3);
    expect(matchLabel('a+b', '+').score).toBe(2);
  });
});

describe('filterByLabel', () => {
  it('keeps matches only, best first, the source order among equals', () => {
    const items = ['Go to table', 'Go to board', 'Create task', 'Toggle density'].map((label) => ({ label }));

    expect(filterByLabel(items, 'to').map((item) => item.label)).toEqual([
      'Go to table',
      'Go to board',
      'Toggle density',
    ]);
  });
});
