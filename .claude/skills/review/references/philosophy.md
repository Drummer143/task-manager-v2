# UI philosophy — reviewable rules

Condensed from the philosophy document, by chapter. Performance (chapter 03 and motion cost)
lives in `performance.md`.

## 01 · Ten principles (lower number wins a conflict)

1. Data integrity over speed — every optimistic answer has a rollback and an explicit failure.
2. Response over result — the reaction to input appears in the first frame.
3. Frequent action → hotkey. Full Tab navigation is **not** a v1 goal; tabbing stays native.
4. One place per action — one canonical path (palette/hotkey); shortcuts may duplicate the
   entry point, never the logic.
5. Reversibility over confirmation — "are you sure?" only for irreversible and destructive.
6. State is always visible — empty, loading, stale, unsaved, conflict. A silent screen is a bug.
7. Density by default — start compact, add air where reading breaks.
8. Line over fill — structure by hairlines and type; fill only what needs attention now.
9. Motion explains, never entertains.
10. Fewer components, more rules — a new component only when a rule stopped working.

## 02 · Vocabulary

- Domain terms match the API: `status` is never "stage"; one concept, one word ("card" is how a
  task looks on a board, not a separate entity).
- Component names inherit the domain: `TaskCard`, `BoardColumn`, `PageTree` — never `ItemBox`.
- Board statuses are configured per board: never hardcode the set of columns.

## 04 · Optimism and reversibility

- Optimistic: move between statuses, assignee, due date, rename, checkbox, order in a column,
  inline cell edit. **Not** optimistic: deleting a page, granting rights, irreversible publish.
- Frame 0: the edit applies locally and looks final — no pulsing, no dimming.
- In flight: one quiet sign only (a dot by the timestamp / a thin line). No overlay, no lock.
- Success is silent. A success toast is noise.
- Failure is loud and in place: the value rolls back, a short reason next to the element, one
  action "Retry". Not a toast while the element is visible.
- Retries are idempotent (operation key). Undo window ≥ 8 s (`--undo-window`) for mass or
  destructive-but-recoverable actions. Offline edits queue, never drop.
- Four write states each have a look: applied locally · in flight · failed · conflict
  (two values side by side, choose with one press, no modal).

## 05 · Keyboard model

- Two notions: **cursor** (current task — application state, not DOM focus; hotkeys act on it;
  works wherever browser focus is, except in inputs) and **edit** (Enter in, Esc cancel,
  ⌘Enter save; canvas hotkeys off while editing).
- Focus is always visible: 2 px accent ring, 2 px offset, never disabled anywhere.
- The cursor is never lost: panel closes → cursor on the task that was open; card deleted →
  neighbor; layer closes → browser focus back to its source.
- **Esc always steps back one level**: edit → selection → close panel → clear filter. Never
  "nothing", never "everything".
- One Enter, one meaning: opens in a list, confirms in an edit, submits in a form.
- Modality and focus return come from the headless primitive — no hand-rolled focus trap.
- Typing traps: single-letter hotkeys do nothing while the caret is in an input
  (`input`/`textarea`/`isContentEditable`, plus the store's edit flag).
- A hotkey means the same thing everywhere (A = assignee on board, table and panel).
- The registry is the single source: palette, cheat sheet `?` and menu hints read it; no
  duplicated strings. Chords (`G B`) for navigation, single letters for cursor actions,
  modifiers for movement and system.
- Every menu shows its item's hotkey on the right. A menu action without a hotkey is a candidate.

## 06 · Command palette

- Opens in one frame on any screen (⌘K), no "loading commands".
- Context first: actions on cursor/selection, then navigation, then global.
- Prefixes: `>` commands, `#` tasks, `@` people, `?` help. Matched letters highlighted, path shown.
- Reversible results apply without confirmation; irreversible go to a confirmation step
  inside the palette, not a modal on top.
- Empty result offers "Create task with this title" — input is never lost.
- Every command shows its hotkey. Esc returns focus exactly where it was opened.

## 07 · Navigation and IA

- Shell: sidebar · canvas (the only content scroll area) · task panel (over the right part of
  the canvas, does not replace it) · layers (palette, cheat sheet, confirmations — **at most one**).
- URL is state: page, view, filters, grouping, open task. A link reproduces the screen.
- Back always works: opening a task is a history entry; closing the panel is a step back.
- Switching board ↔ table keeps filters, selection and cursor.
- Depth ≤ 3 clicks to any task; ≤ 2 actions via the palette.

## 08 · Density

- Density is a container token (`data-density`), not a prop on every component. Only spacing
  and row heights change — never body text size.
- Hit area ≥ 28×28 compact, ≥ 36×36 default (`--hit-min`), even with a 16 px icon.
- Body text never below 14 px; only meta may go to 11–12 px.
- Changing density never refetches data or resets scroll.

## 09 · Board

- Card content, in order: title (≤ 2 lines, full text in tooltip, the only full-brightness
  element) · due signals only when meaningful · assignee avatar 20 px (empty = dashed, assignable)
  · ≤ 3 labels then "+N" · signals (attachments/comments/subtasks) only when non-zero ·
  nothing else (author, dates, id live in the panel).
- Drag starts after 4 px (`--drag-threshold`); lifted card `shadow-md`, ghost outline in place,
  insertion hairline 2 px accent; drop target is a position, not "the column"; linear
  auto-scroll; drop outside returns the card along the same path; applied optimistically, undoable.
- Hotkey move: ⌘+arrows, same animation and undo.
- Selection: Space adds, Shift+arrows range, ⌘A column then board; ⌘/Shift-click; marquee.
  Selection = accent 10% fill + 1 px; the cursor inside it keeps a 2 px ring.
- Selection bar: count, 3–5 actions, "more" in palette, Esc clears; never covers the last row.
- Mass action = one operation, one undo, one error message with the failed count, not N toasts.
- Column header: status name, count (tabular nums), "+". Sticky header. Empty column is a line
  "No tasks · Create C", not blank space.

## 10 · Table

- Cursor is a cell: arrows move, Home/End to row edges, Enter opens, E or typing edits.
- Inline edit by field type; nothing opens in a modal. Tab in edit saves and moves on;
  Esc cancels only the current cell.
- Sticky header, sticky first column; widths persist in the view.
- Numbers and dates: tabular nums, right-aligned, one date format product-wide.
- Parity: every board action is available in the table under the same hotkey.

## 11 · Screen states — acceptance condition, not a wish

| State | Looks like | Never |
|---|---|---|
| First load | skeleton of the real structure, pulse ≤ 6%, ≤ 1 s then static | centered spinner on empty screen |
| Refetch | old data + thin progress under the canvas header | swapping content for skeleton, scroll reset |
| Empty (no data) | one line of reason + one action ("Create task C") | illustrations, long text, emoji |
| Empty (filter) | "No tasks match the filter" + "Reset filter", filter stays visible | same text as true empty |
| Error | exactly where it broke; short reason, Retry, details link | full-screen "something went wrong", stack trace |
| No access | explains what is missing and whom to ask | empty list pretending there is no data |

A data component without empty and error states is not done — `emptyState` / `error` are API.

## 12 · Motion

| Kind | Duration | Curve |
|---|---|---|
| Element state | 90 ms (`--dur-state`) | ease-out |
| Layer appears | 140 ms (`--dur-layer`) | `--ease-out` |
| Task panel | 180 ms (`--dur-panel`) | `--ease-out` |
| Object moves | 200 ms (`--dur-move`) | ease-in-out |
| Leave / disappear | ≤ 120 ms (`--dur-exit`) | ease-in |

Nothing blinks twice; pulsing only for "in flight" at 6% contrast.

## 13 · Accessibility (baseline)

- Semantics before ARIA: a button is `<button>`, a link is `<a href>`. `div` + `onClick` is a
  review defect.
- Complex behavior (menu, combobox, dialog, tabs) from a headless primitive; styles are ours.
- Contrast: body ≥ 4.5:1, large text/icons ≥ 3:1. Accent is not used for small text — take the
  dark ramp step.
- Color is never the only carrier: overdue = color + word; status = color + name; conflict =
  color + icon.
- Every state change is announced once via a live region, ≤ one message per 500 ms.
- Zoom 200% does not break the layout. Drag has a hotkey equivalent. No focus traps except
  modal layers, which always exit on Esc.

## 14 · Offline and sync

- Online shows nothing. Unreliable: thin bar + "Syncing" in the status bar. Offline: persistent
  "No connection · N edits pending"; edits keep applying, only server-only operations are disabled.
- Queue is visible and cancellable per edit; order per object preserved.
- Stale data (> 1 min while offline) is marked with its time.
- Remote changes: update in place with a 400 ms highlight (`--highlight-remote`); never steal
  focus, never close the open panel; a deleted object keeps the panel with "Task deleted".

## 15 · Notifications

- Channels: inline (errors on a visible element) · undo bar (8 s) · status line (connection) ·
  inbox · modal (only irreversible).
- No success toasts. One bar per screen; new replaces old; no toast stacks.
- Errors never disappear on a timer. Counters: tabular nums, no animation.

## 16 · Tokens and naming

- Three layers: primitives (`--c-*`, never used in components) · semantics (the theme) ·
  component tokens (only where an outside override is needed).
- **No literal in a component** — no color, spacing, radius, duration, z-index.
- Names describe the role, not the look: `--state-overdue`, not `--red`.
- Scales: spacing 2 4 8 12 16 24 32 48; radii 2 4 7; shadows sm md lg. Six type steps.
- Numbers in UI are tabular (`font-variant-numeric: tabular-nums` / `--num-tabular`).
- z-index is an enumeration: content, sticky, dropdown, layer, toast.
- Theme switches at the root (`data-theme`), without JS color substitution.

## 17 · Component contracts

1. A component does not know about data: no requests, no stores inside. The screen wires data.
2. Controlled is mandatory; uncontrolled is sugar (Primitives 00 goes further: controlled only).
3. One component, one responsibility (`TaskCard` draws, `BoardColumn` lays out, a hook mutates).
4. Variants are enums, not boolean flags (`variant="primary|secondary|ghost"`, not `isPrimary`).
5. Sizes come from density, not a `size` prop — except icon-like components.
6. Every interactive component registers its keys and shows them in hints.
7. Every data component has empty and error states as part of its API.
8. Styles pass only through `className` and layer-3 tokens; no deep `styles.header.title`.
9. No display logic in domain components: date formats, plurals, truncation are shared utils.

## 18 · Copy

Buttons are result verbs ("Create task", not "OK"). Errors: what · why · what to do. No
apologies, no exclamation, no emoji. Numbers instead of adverbs. Empty states name the next step.
No placeholders ("Lorem", "TODO", "test task") in shipped UI.

## 19 · Pre-merge checklist and hard bans

Checklist: hotkeys for frequent actions and in the registry · focus visible and returned after
layers · Esc defined at every level · loading/empty/empty-by-filter/error/no-access drawn ·
actions undoable and in ⌘Z · first-frame response, no spinner before 200 ms · state in URL,
scroll and cursor restored · all values from tokens · works in compact density and at 200% zoom ·
hotkeys shown in menus · copy checked against 18 · no new component where a rule would do.

Bans: modal for a form (create/edit live in the panel or in place) · spinner instead of
structure · toast stacks · color as the only meaning · hover-only actions (unreachable by
keyboard means they do not exist) · two menus with different logic for one action.
