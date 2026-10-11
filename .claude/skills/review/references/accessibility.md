# Accessibility in code

The baseline is Philosophy 13 (and 05 for the keyboard). This file is how to check it in a diff.
Patterns follow the WAI-ARIA Authoring Practices (cite as `APG <pattern>`). Prefer the kit's
primitives: they already carry the semantics; most findings are product code going around them.

Severity: a control that cannot be reached or operated from the keyboard, or has no accessible
name, is a **blocker** (`div` + `onClick` is already one per SKILL.md). Wrong or missing state
(`aria-expanded`, `aria-selected`, live announcement) is **major**.

## Semantics and names

- **Native elements first.** `<button>` for actions, `<a href>` (the kit's `LinkBase`) for
  navigation. A `role="button"` element also needs `tabIndex={0}` and Enter / Space handling;
  ask why it is not a `<button>`.
- **A link goes somewhere**: `href="#"` or a link with `onClick` and no real `href` is a finding —
  it breaks middle-click, new tab, and screen-reader link lists. Build the URL.
- **Every control has an accessible name.** Icon-only buttons pass `label` (`IconButton`);
  fields have a visible label or `aria-label` / `aria-labelledby`; a name that duplicates the
  role ("Close button") is a nit.
- **Landmarks and regions are named** when there is more than one of a kind
  (`<aside aria-label>`, `<nav aria-label>`).
- **Decorative is hidden, meaningful is spoken.** Icons next to text are `aria-hidden`; an
  icon or color that carries meaning alone gets text (visually hidden if needed) — Philosophy 13:
  color is never the only carrier.
- **Headings form an outline**: one level per step, not chosen for size.

## Composite widgets (grid, listbox, tree, menu, tabs)

- **One tab stop.** The container takes focus (`tabIndex={0}`); arrows / J-K move inside. Rows
  and cells are not in the tab order.
- **`aria-activedescendant` points at an element that exists.** With a virtual list the cursor's
  row must stay mounted while scrolled away (`VirtualList`'s `cursorKey`); an id of an unmounted
  row is a finding. Ids are unique per instance (`useId` or a prefix).
- **Structure matches the role.** `grid > rowgroup > row > gridcell`; `listbox > option`;
  `tree > treeitem (+ group)`. Anything else directly inside (a footer, a "Loading…" line, a
  wrapper with a role) breaks it: give it the right role (`row` + `gridcell`) or move it outside.
  Wrappers in between are `role="none"` or plain `div`s.
- **Size and position when not all rows are in the DOM**: `aria-rowcount` (−1 while more pages
  are coming) and 1-based `aria-rowindex` on rows; for lists `aria-setsize` / `aria-posinset`.
- **State attributes are present and live**: `aria-selected` / `aria-current` on the cursor or
  selection, `aria-expanded` on expandable items and triggers, `aria-checked` on toggles,
  `aria-busy` on a region that is loading.
- **Complex patterns come from a headless primitive** (Zag) — a hand-rolled menu, combobox,
  dialog or tabs is a finding (Philosophy 13).

## Focus

- **Always visible**: the 2 px accent ring with 2 px offset (Philosophy 05). `outline: none`
  without the kit's `:focus-visible` replacement is a blocker.
- **Never lost to `body`.** When the focused element leaves (row archived, panel closed, edit
  ended), focus or the cursor moves to a neighbor or back to where the layer was opened from.
  Check unmount paths, not just the happy path.
- **Programmatic focus does not jump the page**: `focus({ preventScroll: true })` when the
  element is already placed, scrolling handled by the list.
- **No focus traps except modal layers**, and those close on Esc and return focus.
- **Focus is not stolen** by remote updates, toasts or async results (Philosophy 14).

## Disabled and read-only

- The kit's disabled is **`aria-disabled` + a reason tooltip, still focusable**, so the reason is
  reachable from the keyboard (`Repo`: `Checkbox`, `FieldInput` — "disabled the kit way"). Native `disabled` on a kit control hides the
  reason and is a finding, unless the control is truly irrelevant (a submit with nothing to send).
- A disabled control ignores activation in its handler — `aria-disabled` alone does not block
  clicks.

## Announcements

- **State changes are announced once** through the existing live regions (`ToastHost`'s
  announcer, polite / assertive). A component adding its own `aria-live` region, or a region that
  is mounted together with its text (often not read), is a finding.
- **Errors are tied to fields**: `aria-invalid` + `aria-describedby` pointing at the message.
- **Loading**: `aria-busy` on the region immediately; the spinner may wait (`useDelayedFlag`),
  the attribute may not.
- Hotkey hints have spoken text (`Kbd` renders it); a visual-only shortcut legend is a finding.

## Keyboard

- **Every pointer action has a keyboard path**: hover-only buttons appear on focus / cursor too;
  drag has a hotkey equivalent (Philosophy 13); context menus open on Shift+F10 / the menu key.
- **Single-key hotkeys do not fire while typing** (`isTypingTarget`) and are listed in the
  registry with a description.
- **Home / End / PageUp / PageDown** act on the list only while it has focus; elsewhere they are
  the browser's.

## Layout, text, motion

- **Zoom 200% and long text**: no fixed heights that clip text, no horizontal page scroll;
  truncation has the full text available (tooltip on overflow).
- **Hit targets** at least 24 × 24 px (WCAG 2.5.8), including row actions shown on hover.
- **Contrast from tokens only** — a literal color can fail contrast on one surface; accent is not
  used for small text (Philosophy 13).
- **Reduced motion** is handled by the token layer (see `performance.md`, Motion cost).

## Tests

- Tests query by role and name (`getByRole('button', { name: … })`). A test that needs
  `getByTestId` for something interactive usually means the control has no name — check it.
- Composite widgets get a test of their keyboard contract and of `aria-activedescendant` /
  state attributes following the cursor.
