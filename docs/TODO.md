# Blocked work

What cannot be done yet because something it needs does not exist. Grouped by that something:
when it lands, its section is the list to pick up. Work that can be done now stays in the area's
own TODO (`apps/frontend/src/pages/Inbox/TODO.md`, `packages/frontend/ui-kit/TODO.md`).

Move an item back to its area's TODO when it unblocks; tick or delete it here when it lands.

## Workspaces

Built: the tables, create / list / get / resolve / slug-available / `me` / PATCH / delete / restore /
stats, change history, `data.changed` signals with the `workspace:{id}` socket channel, the
personal workspace, and on the frontend the resolving of `/{slug}`, the switcher and the sidebar.
Paused on 2026-10-23 to work on pages; the rest, by what it waits on (access spec = «Verso —
пространства и доступ», part 1):

Creating workspaces:
- [ ] The "Create a workspace" screen; the switcher's "New workspace" and the empty state at `/`
      (`TODO(workspaces)` in `app/WorkspaceEntry.tsx`) open it
- [ ] `canCreateWorkspace` in `/me` and the check in `POST /workspaces` (`TODO` in
      `workspaces/controllers/create.rs`): `VERSO_WORKSPACE_CREATION = anyone | instance_admins`,
      default `anyone` (§10). The switcher's "New workspace" goes by it, not by
      `canWorkspaceSettings` (Sidebar · 01)
- [ ] `users.instance_admin` (§10): only with the instance page. Better taken from an authentik
      group in the token than from `VERSO_BOOTSTRAP_EMAIL` (authentik's `email_verified` is always
      false, so a self-registered account with that email would become admin)

Workspace settings (designer's part 2; the user builds the UI):
- [ ] The page `/{ws}/settings/workspace/{tab}`: General, Members, Roles, Invites, Labels,
      Danger zone. `Layout` passes `onOpenSettings` / `onInvite` to the switcher, and the hotkeys
      `G W` (by `canWorkspaceSettings`) and `G ,` (Preferences) get registered
- [ ] Danger zone of the personal workspace: no Delete / Transfer, the reason instead
      (`isPersonal`)
- [ ] Workspace icons: the frontend needs storage's address for `iconAssetId` (`TODO(storage)` in
      `widgets/Layout/Layout.tsx`); the icon upload lives in General

Members and roles (backend, §2, §9.1):
- [ ] Members: list, remove, leave (`POST …/leave`); the owner can't leave, nobody leaves their
      personal workspace
- [ ] Roles: create, edit, delete, "Managed by" (`role_managers`); assigning (`PUT …/members/{uid}/
      roles`) with the no-escalation rules (`WorkspaceContext::can_assign` is there)
- [ ] `access_epoch` grows on every change of roles and grants; `/me` returns it once the client
      caches capabilities
- [ ] Signals (§8): `member.joined / removed / roles_changed`, `role.*`, `workspace.owner_changed`
      with the tags `members:{ws}`, `roles:{ws}`, `role:{id}`, `me`
- [ ] A removed member is thrown out of the `workspace:{id}` socket channel; now they keep it until
      they reconnect

Invites (part 3):
- [ ] Invite links and email invites, `/join/{token}` (HMAC token), accept / decline / undecline
      from Inbox (§3.2–3.4)

Owner operations:
- [ ] Transfer ownership (§9.3); refuses the personal workspace (`workspace.transfer` is already
      false there)
- [ ] Export (`workspace.export`)
- [ ] The job that erases a workspace 30 days after its delete (§9.4); the mail to admins on delete
      needs SMTP
- [ ] Account deletion (§9.6) deletes the personal workspace explicitly: the users row is not
      deleted, so `ON DELETE CASCADE` of `personal_of` does not fire

Frontend:
- [ ] The screens "This workspace was deleted" (`workspace.deleted`) and "You no longer have
      access to this workspace" (`member.removed`), §8 / §3.1. Now both are a toast and a move to
      another workspace: resolve answers 404 alike, so the frontend can't tell them apart yet
- [ ] A workspace's home: the last page opened in it, else Inbox (Sidebar · 01). Now always Inbox
- [ ] The last workspace is kept per browser (localStorage): on another device the personal one
      opens, not the last one. Server-side only if the designer asks

Small:
- [ ] `GET /workspaces/slug-available` takes `?s=`, the spec says `?slug=`

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
