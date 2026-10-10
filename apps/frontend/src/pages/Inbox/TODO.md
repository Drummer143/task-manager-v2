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
- [ ] Enter / O — open in the panel: real `href`s (`?task=` / `?invite=`, replace) instead of `#`.
      Spec 11: the API gives only `subject { type, id, key, pageId }`; the front builds
      `inboxHref(n, view)` and `objectHref(subject)` in one place, beside `parseSidePanel` / `writeSidePanel`
- [ ] ⌘Enter — a new tab; G O — the object's own page (`objectHref`)
- [ ] J / K with the panel open — the panel follows the cursor (navigate with replace)
- [x] G U / G A / G E — the tabs

## List (§04, §06)

- [x] Next pages: `onEndReached` with `endThreshold` 10; the footer (`InboxListFooter`) is a
      `row` + `gridcell` inside the grid, only while the next page loads or failed, with Retry.
      A failed next page or background refetch keeps the list; the error state is for an empty one
- [x] Groups: Today / Yesterday / This week / Earlier (`grouping.ts`): a flat list of header and
      row entries for `VirtualList`, headers are grid rows (`rowheader`) the cursor steps over,
      32 px, text at `--inbox-text-start`; by `sortDateOf` (the sort's own date), local calendar
      days, the locale's first weekday. `now` is read once per visit
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
- [ ] The Account group (`listAccountNotifications`, one page, above Today) and invites: Join / Decline in the row, ⇧Enter / ⇧⌫, the palette, `?invite=` in the panel
- [ ] Auto-read after `--inbox-auto-read` (1 s) of showing in the panel

## Deferred

- Selection (X, ⇧J / ⇧K) and SelectionBar — nothing to share it with until the task table exists;
  when it comes, E / U act on the selection: keep "which rows" in one `targets()` function
- ⇧M Unfollow — no model of following yet
- The tab title count and the favicon dot
- One-letter hotkeys (E, U, X, J, K) do nothing in a non-Latin keyboard layout — the kit matches
  `event.key`; the fix is to fall back to `event.code` in the hotkey matching

## Loose ends

- [x] The route is `/{ws}/inbox` (`ROUTES.INBOX`, `inboxPath`); `/` and unknown paths go to the
      default space's inbox — for now the nil uuid (`defaultWorkspaceId`)
- [ ] `defaultWorkspaceId`: the active space from localStorage, else the first from `/me`
- [ ] `Inbox.module.scss` header: `48px`, `12px`, `16px` fail the literal check —
      `--canvas-header-height`, `--sp-4`, `--sp-5`
- [ ] `src/app/app.spec.tsx` imports the deleted `WorkspacePage`: the frontend tests fail
- [x] ⇧U is registered with an object made in render: it re-registers every render (`useMemo` it)

## For the designer

- Line heights 14/20 and 12/18 in the spec, the kit's `--lh-body` / `--lh-meta` give 21 / 16.8.
- Row action icons on the inverse surface: the mock has `--text-muted`, built as `--text-secondary`.

Closed 2026-10-10: the text starts at 56 px (8 + 8 + `--inbox-dot-gap` 8 + 20 + 12; without the gap
the dot reads as part of the avatar), and the address is `/{ws}/inbox`.

## Backend

- Folding notifications (count, last actor, moves up on a new event; safe under concurrent inserts)
- [x] Per workspace (2026-10-10): `GET /notifications?workspace=` (required), the account-level
      ones apart at `GET /notifications/account`, `read_all { workspace, before }` reads one
      workspace only, the summary is `{ byWorkspace, accountUnread }`. `workspace_id NULL` is an
      account-level notification. Membership is a stub (`main_service/src/workspaces.rs`,
      `TODO(workspaces)`): every workspace is allowed
- [x] All Rust tests, the DB ones included, pass on a disposable Postgres 18.6 with the squashed
      `init` migration and UUIDv7 ids (161, 2026-10-10)
- Invites: `decline` / `undecline` with a 60 s window, `409 invite.decline_final` after it
- The `inbox.updated` signal with `patch { unread }` and the list tag
