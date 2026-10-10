# Inbox — what is left

Spec: "[Уведомления] Inbox" (section numbers below are its own). Tick a box when it lands;
move an item to "Deferred" with a reason rather than deleting it.

## Done

- [x] `NotificationRow` (`shared/ui/NotificationRow`): states, time, actions over the right edge (§02)
- [x] Cursor: J / K and ↑ / ↓ anywhere on the page, Home / End on the list, a click puts it on the row;
      kept by id in the kit's `useCursorStore`, cleared on a tab change and on leaving the page;
      a move re-renders two rows only (§08)
- [x] Grid semantics: `role="grid"`, `aria-activedescendant`, VirtualList `semantics="rows"`,
      `aria-rowindex` / `aria-rowcount` (§08)
- [x] Data on react-query: the list per tab; read / unread / archive / unarchive / read all —
      optimistic, with an undo toast (§05, §10)

## Keyboard (§05, §08)

- [x] E / U on the highlighted row (`useRegisterKeyboardHandlers`); E is Unarchive in the Archived tab
- [x] Archive / Unarchive moves the cursor to the next row (the previous one at the end) *before*
      the row leaves, from E and from the row's button (`cursor.ts`, wrapped in the page)
- [ ] Enter / O — open in the panel: real `href`s (`?task=` / `?invite=`, replace) instead of `#`
- [ ] ⌘Enter — a new tab; G O — the object's own page (`objectHref`)
- [ ] J / K with the panel open — the panel follows the cursor (navigate with replace)
- [x] G U / G A / G E — the tabs

## List (§04, §06)

- [x] Next pages: `onEndReached` with `endThreshold` 10; the footer (`InboxListFooter`) is a
      `row` + `gridcell` inside the grid, only while the next page loads or failed, with Retry.
      A failed next page or background refetch keeps the list; the error state is for an empty one
- [ ] Groups: Today / Yesterday / This week / Earlier (`--inbox-group-height`, text at `--inbox-text-start`)
- [x] States: skeleton after 200 ms (`NotificationRowSkeleton`), empty per tab, load error with Retry
- [x] No `?view=` is the All tab (`currentView`), also for the empty state
- [ ] `keepReadIds`: a row read in the Unread tab stays until the tab changes, also across refetches

## Counters and realtime (§09, §10)

- [ ] The Unread tab's count — needs a count in the kit's Segmented
- [ ] The sidebar Inbox count from the summary (`by_workspace[current] + account_unread`)
- [ ] `inbox.updated`: patch the summary, refetch the list; highlight new rows (`--highlight-remote`);
      the cursor and the scroll do not move

## Content (§01, §02, §03, §05)

- [ ] Texts per kind (`inbox.messages.ts`); only `debug` exists so far
- [ ] System avatars (due soon, overdue) and `--state-warning` with its palette steps
- [ ] The Account group and invites: Join / Decline in the row, ⇧Enter / ⇧⌫, the palette, `?invite=` in the panel
- [ ] Auto-read after `--inbox-auto-read` (1 s) of showing in the panel

## Deferred

- Selection (X, ⇧J / ⇧K) and SelectionBar — nothing to share it with until the task table exists;
  when it comes, E / U act on the selection: keep "which rows" in one `targets()` function
- ⇧M Unfollow — no model of following yet
- The tab title count and the favicon dot
- One-letter hotkeys (E, U, X, J, K) do nothing in a non-Latin keyboard layout — the kit matches
  `event.key`; the fix is to fall back to `event.code` in the hotkey matching

## Loose ends

- [ ] `Inbox.module.scss` header: `48px`, `12px`, `16px` fail the literal check —
      `--canvas-header-height`, `--sp-4`, `--sp-5`
- [ ] `src/app/app.spec.tsx` imports the deleted `WorkspacePage`: the frontend tests fail
- [x] ⇧U is registered with an object made in render: it re-registers every render (`useMemo` it)

## For the designer

- Text start 48 px (spec text: no gap after the dot) or 56 px (spec mock: a gap)? Built as 56.
- Line heights 14/20 and 12/18 in the spec, the kit's `--lh-body` / `--lh-meta` give 21 / 16.8.
- Row action icons on the inverse surface: the mock has `--text-muted`, built as `--text-secondary`.

## Backend

- Folding notifications (count, last actor, moves up on a new event; safe under concurrent inserts)
- `account_unread` in the summary
- Invites: `decline` / `undecline` with a 60 s window, `409 invite.decline_final` after it
- The `inbox.updated` signal with `patch { unread }` and the list tag
