# Typography

From the typography spec («[UI-kit] Типографика», sections 01–08; cite as `Typography 02`). Every
rule here is visible on screen; check them in styles, components and UI strings alike.

Severity: a literal size, weight or line height instead of a token is a **blocker** (it is a
hard rule, as for colors). An off-scale step, a lost meaning (truncated message, color alone) is
**major**. A wrong quote, dash or ellipsis in a UI string is **minor**.

## Fonts (Typography 01)

- **Two families only**: `--font-ui` (system sans) and `--font-mono`. No web fonts in the product:
  they cost load time and the identity is in the grid, not the face.
- **Mono is for identifiers, keys and code** — `TM-248`, `⌘K`, a hash. Never for ordinary text to
  look "technical".
- **No emoji in the interface's own text.** In the user's text (titles, icons they picked) they
  are theirs.

## Scale (Typography 02)

| Step | Size / line height | Where, and only there |
| --- | --- | --- |
| `display` | 28 / 1.2 · 600 | A document page's title, first-run empty screens. One per screen at most |
| `h1` | 22 / 1.25 · 600 | A task's title in the panel, a board's title, a document's H1 |
| `h2` | 18 / 1.3 · 600 | Sections of the task panel, table group headers, H2 |
| `h3` | 15 / 1.4 · 600 | Board column titles, form and settings subheads, H3 |
| `body` | 14 / 1.5 · 400 | Everything that is content: card titles, cells, menu items, md buttons, fields |
| `meta` | 12 / 1.4 · 400 | Dates, counters, ids, field labels, hotkeys, hints, tags. Never the only carrier of meaning |

- **A size comes with its line height**: `font-size: var(--type-X)` goes with
  `line-height: var(--lh-X)` of the same step (or inherits it from a parent of that step). A
  size with a foreign line height is a finding.
- **Controls are on the scale**: md button and menu item — `body`; sm button, segment, tag,
  `Kbd` — `meta`. 11, 11.5 or 13 px do not exist; any size outside `--type-*` is a finding,
  including one hidden in a component token.
- **Density never changes text size** — only heights and padding.
- **Tracking is 0.** No `letter-spacing`, no `text-transform: uppercase` in the product (the
  sign-in wordmark is the one exception, by its own token).
- Icon and emoji glyphs sized with `font-size: var(--icon-size)` or another icon token are not
  text and are fine.

## Weight and emphasis (Typography 03)

- **400 and 600, nothing else** (`--weight-normal`, `--weight-strong`); 500 exists nowhere, not
  even for a "slightly stronger" line — a read row is 400 secondary, an unread one 600 primary. 600: headings of every
  step, the selected value in a list, the match in search, the number of a signal counter.
- **Bold inside text is meaning, not decoration.** Italic only in the user's text and quotes —
  the interface never writes in italic. Underline only for links in text.
- **Hierarchy order**: position → size → weight → color. Raising something with color first,
  where position or size would do, is a finding with a screen to point at.
- **No caps**, except abbreviations (API, URL) inside text.

## Color of text (Typography 04)

- **Roles, not shades**: `--text-primary / secondary / muted / placeholder / disabled / accent /
  on-accent / danger`. A neutral step (`--c-n-600`) as a text color is a finding: the inverse
  surface will not follow.
- **`--text-muted` never carries meaning alone** (it is ≥ 4.5:1 but second rank); placeholder is
  not text (≈ 3:1) — never for a value.
- **The accent base color never paints text below 18 px**: only `--text-accent` (700 on light,
  300 on dark).
- **Color is never the only meaning**: "Overdue" is written as a word, not only in red.

## Numbers (Typography 05)

- **Tabular in data, proportional in prose**: counters, dates, times, table columns, anything
  that updates in place or aligns in a column — `font-variant-numeric: var(--num-tabular)` (or
  `Text numeric`). A counter that jitters as it changes is the visible failure.
- Formats: counters in full up to 9 999 then shortened (`12k`), the separator from the locale;
  dates as DatePicker shows them, the full one in a tooltip; time `14:32`, no seconds; relative
  time ("5 min ago") only in activity and "edited …", older than a day — a date; ids mono and
  `meta`; ranges with an en dash (`Sep 21 – 27`, `2–5`); `62%`, `2.4 MB`.

## Truncation and wrapping (Typography 06)

- **One line with an ellipsis** for cells, menu items, triggers; **two lines clamped**
  (`--line-clamp-title`) for card titles; **middle** for long paths and ids (breadcrumbs).
- **Truncated text is always reachable in full** — a tooltip when it is actually cut (`Text
  truncate` does it). An ellipsis with no way to read the rest is a finding.
- **Messages are never truncated**: errors, reasons, confirmations, empty states, tooltips wrap.
- `text-wrap: pretty` for paragraphs, `balance` for headings; `hyphens: auto` only in a page's
  long text (the editor). Unbroken strings (URLs, hashes) get `overflow-wrap: anywhere` so they
  do not break the grid.

## Writing (Typography 07)

UI strings are stored with the right characters; the font does not fix them. Check string
literals in components, `MessagesContext` defaults and app copy:

| Rule | Right | Wrong |
| --- | --- | --- |
| Case | Create task · Due date | Create Task · CREATE |
| Buttons are verbs | Move · Delete · Retry | OK · Submit · Yes |
| Quotes | Create label “perf” | Create label "perf" |
| Apostrophe | Can’t read | Can't read |
| Ellipsis | Move… (one character) | Move... |
| Separator in a line | Anna Kim · 14:32 | Anna Kim \| 14:32 · Anna Kim - 14:32 |
| Dash | Not saved — offline | Not saved - offline |
| Keys | ⌘K · Enter · G › B | Cmd+K · ENTER |
| Final period | Only in texts of 2+ sentences | In buttons, titles, menu items |
| Tone | Couldn’t load people | Oops! Something went wrong 😕 |

Tests that assert a string use the same characters; a test with `Can't` next to a component
with `Can’t` means one of them is wrong.

## Motion (Typography · animations)

Text changes and numbers change instantly — no cross-fade, no counting up. An ellipsis is static,
no gradient mask. The color of text in interactive elements belongs to the component's state
transition, not to typography.

## What the guards already check

`pnpm run check:ds` fails on: a bare `font-size: var(--type-…)` (use the `type()` mixin), a size,
weight or line height that is not a token (`line-height: 1` is allowed for one line centred in a
box — the mixin's `$single-line`), any tracking that is not a token, `uppercase` / `capitalize`,
italic, `fontSize` / `fontWeight` / `lineHeight` / `letterSpacing` in TSX, and the wrong
apostrophe, quotes, ellipsis, dash or separator in UI strings (`tools/check-copy.mjs`). Report a
guard failure as a finding; review by eye what they cannot see: the step chosen for a place, the
role of a color, tabular digits, truncation without a way to the full text.

## API (Typography 08)

- **Kit components take `size` from the scale, never `fontSize`** or a style with a size.
- **`Text` without `tone` takes the color around it** (an error banner's, a primary button's,
  an inverse surface's); plain text is primary because the app's root sets `--text-primary`.
  Setting `tone="primary"` inside a colored block, where the block's color was meant, is a
  finding.
- **The current page in a header is 400**, set apart by color only, as in Breadcrumbs.
- **`Heading level` ties the tag and the step**: `level={2}` is both `<h2>` and the h2 size.
  Another size for the same level, or a heading level chosen for its size, is a finding (it also
  breaks the outline, see accessibility).
- In module CSS the step is applied as a pair (the `type()` mixin, or both tokens of one step);
  in composition, `Text` / `Heading` rather than a `<span>` with an ad-hoc class.
