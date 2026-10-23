# Blocked work

What cannot be done yet because something it needs does not exist. Grouped by that something:
when it lands, its section is the list to pick up. Work that can be done now stays in the area's
own TODO (`apps/frontend/src/pages/Inbox/TODO.md`, `packages/frontend/ui-kit/TODO.md`).

Move an item back to its area's TODO when it unblocks; tick or delete it here when it lands.

## Workspaces

The table, the endpoints and the frontend's resolving of `/{slug}` are there. What is left waits on
other pieces:

- [ ] Workspace icons in the sidebar (`TODO(storage)` in `widgets/Layout/Layout.tsx`): the app
      does not know storage's address yet, so `iconAssetId` has no URL; the letter is drawn
- [ ] Creating a workspace has no screen: the switcher's "New workspace" waits for it, and for
      `canCreateWorkspace` in `/me` (`VERSO_WORKSPACE_CREATION`). The empty state at `/` stays only
      as a fallback: everyone has a personal workspace, made at `/me`
- [ ] Leave and transfer (not built yet) must refuse the personal workspace (`personal_of`)
- [ ] The switcher's Workspace settings, Invite members, Profile, Preferences: the sidebar shows
      them once `Layout` passes `onOpenSettings` / `onInvite`

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
