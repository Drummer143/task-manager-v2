# Blocked work

What cannot be done yet because something it needs does not exist. Grouped by that something:
when it lands, its section is the list to pick up. Work that can be done now stays in the area's
own TODO (`apps/frontend/src/pages/Inbox/TODO.md`, `packages/frontend/ui-kit/TODO.md`).

Move an item back to its area's TODO when it unblocks; tick or delete it here when it lands.

## Workspaces

No workspaces table yet. Inbox is already per workspace (route `/{ws}/inbox`, API `?workspace=`),
with stubs in their place.

- [ ] `ensure_member` and `member_workspace_ids` in `apps/main_service/src/workspaces.rs`
      (`TODO(workspaces)`): every workspace is allowed now. Then: a non-member gets a 404 on the
      list and on read-all; the summary counts only the workspaces the user is in (backend spec,
      notifications §8.2: no access, not served)
- [ ] `notifications.workspace_id` → `REFERENCES workspaces` (it stays nullable: NULL is an
      account-level notification)
- [ ] `defaultWorkspaceId()` in `apps/frontend/src/shared/constants/routes.ts` returns the nil uuid:
      the active workspace from localStorage, else the first from `/me`

## Real notification kinds and `subject`

Only `debug` exists. It has no `subject`, so nothing to open; its rows are not links (decided
2026-10-10, nothing is added to debug notifications for it).

Backend:
- [ ] `subject { type, id, key, pageId }` on `Notification` (Inbox spec 11); the API gives no URLs,
      the frontend builds them
- [ ] Folding: `group_key`, count, last actors, moves up on a new event; safe under concurrent
      inserts (backend spec, notifications §8)

Inbox (spec sections in brackets):
- [ ] The side panel: `?task=` / `?invite=` through `parseSidePanel` / `writeSidePanel`
      (`apps/frontend/src/shared/utils/sidePanel.ts`), rendered by `Layout` through
      `AppShell panel` + `onPanelClose`. Ids in the URL, never content
- [ ] Enter / O open in the panel: the row's `href` (replace) from `inboxHref(n, view)` (§05, §11)
- [ ] ⌘Enter — a new tab; G O — the object's own page, `objectHref(subject)` (§05)
- [ ] J / K with the panel open: the panel follows the cursor, navigate with replace (§05)
- [ ] Auto-read after `--inbox-auto-read` (1 s) in the panel; quick J / K reads nothing (§05)
- [ ] Texts per kind (`inbox.messages.ts`) (§02, §03)
- [ ] System avatars (due soon, overdue) and `--state-warning` with its palette steps (§02)

## Invites

- [ ] Backend: invites; `decline` / `undecline` with a 60 s window, `409 invite.decline_final` after
- [ ] Inbox: Join / Decline in the row, ⇧Enter / ⇧⌫, the palette, `?invite=` in the panel with the
      accepted / declined / revoked states (§01)

## Tasks and the task table

- [ ] Selection (X, ⇧J / ⇧K) and SelectionBar in Inbox — shared with the task table; then E / U act
      on the selection: keep "which rows" in one `targets()` function
- [ ] ⇧M Unfollow — needs a model of following

## Waiting on design

- [ ] Line heights 14/20 and 12/18 in the Inbox spec; the kit's `--lh-body` / `--lh-meta` give
      21 / 16.8
- [ ] Inbox row action icons on the inverse surface: the mock has `--text-muted`, built as
      `--text-secondary`

## Spec corrections to send

- [ ] Workspace menu dots (Sidebar §02, Inbox §09): a dot only where the workspace itself has
      unread (`byWorkspace[id] > 0`), without `account_unread` — our decision, 2026-10-10.
      Otherwise one unread invite lights every workspace and the dot no longer says where.
      The sidebar Inbox count does include it (`byWorkspace[current] + accountUnread`), and
      "Mark all read" reads the account-level ones too

- [ ] "Verso — backend · notifications and refresh" §8–9 lags behind Inbox v5:
      `workspace_id uuid not null` (Inbox has account-level ones with NULL), no workspace parameter
      on the list, no `account_unread` in the summary, `subject.href` in the payload
