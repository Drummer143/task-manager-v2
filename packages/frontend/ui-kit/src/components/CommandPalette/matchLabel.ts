/** A part of a label, marked when it matched the query. */
export interface MatchSegment {
  text: string;
  match: boolean;
}

export interface LabelMatch {
  /** 3 — a word starts with the query; 2 — a substring; 1 — its letters in order; 0 — no match. */
  score: 0 | 1 | 2 | 3;
  segments: MatchSegment[];
}

const toSegments = (label: string, marked: boolean[]): MatchSegment[] => {
  const segments: MatchSegment[] = [];

  for (let index = 0; index < label.length; index++) {
    const last = segments[segments.length - 1];

    if (last && last.match === marked[index]) {
      last.text += label[index];
    } else {
      segments.push({ text: label[index], match: marked[index] });
    }
  }

  return segments;
};

/** A word starts after a space or a punctuation mark: "Move to Done", "Product / Web", "(all)". */
const isBoundary = (char: string | undefined) => char === undefined || !/[\p{L}\p{N}]/u.test(char);

/** Where the query starts a word of the text, or -1. */
const findWordStart = (text: string, needle: string) => {
  for (let index = text.indexOf(needle); index !== -1; index = text.indexOf(needle, index + 1)) {
    if (isBoundary(text[index - 1])) {
      return index;
    }
  }

  return -1;
};

const range = (label: string, start: number, length: number) =>
  Array.from(label, (_, index) => index >= start && index < start + length);

/**
 * How a label matches a query (spec: CommandPalette · search): the start of a
 * word beats a substring, a substring beats letters in order ("mvd" → Move to
 * Done). The segments are what the palette shows in bold. Sources rank with
 * the score; ties are theirs to break (frequency, recency).
 */
export const matchLabel = (label: string, query: string): LabelMatch => {
  const needle = query.trim().toLowerCase();
  const haystack = label.toLowerCase();

  if (!needle) {
    return { score: 3, segments: [{ text: label, match: false }] };
  }

  const wordStart = findWordStart(haystack, needle);

  if (wordStart !== -1) {
    return { score: 3, segments: toSegments(label, range(label, wordStart, needle.length)) };
  }

  const substring = haystack.indexOf(needle);

  if (substring !== -1) {
    return { score: 2, segments: toSegments(label, range(label, substring, needle.length)) };
  }

  const marked = Array.from(label, () => false);
  let position = 0;

  for (let index = 0; index < haystack.length && position < needle.length; index++) {
    if (haystack[index] === needle[position]) {
      marked[index] = true;
      position++;
    }
  }

  if (position === needle.length) {
    return { score: 1, segments: toSegments(label, marked) };
  }

  return { score: 0, segments: [{ text: label, match: false }] };
};

/** Items whose label matches, best first; equal scores keep the source's order. */
export const filterByLabel = <T extends { label: string }>(items: T[], query: string): T[] =>
  items
    .map((item, index) => ({ item, index, score: matchLabel(item.label, query).score }))
    .filter((entry) => entry.score > 0)
    .sort((a, b) => b.score - a.score || a.index - b.index)
    .map((entry) => entry.item);
