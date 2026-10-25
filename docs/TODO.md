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

## Pages

Built on 2026-10-24 (backend: `docs/pages-backend.md` "Built"; frontend: the Pages section of the
sidebar on the kit Tree, `/{ws}/p/{shortId}` with the title edited in place, the crumbs in the
canvas header, a group's children, the trash state with Restore; e2e `pages.spec.ts`). Specs:
«Verso — страницы» (part 1), «[Страницы] Создание страницы». Not done yet, by area:

Bodies (Yjs on Hocuspocus, decided 2026-10-24) — `docs/pages-backend.md` §3–§5:
- [ ] collab_service (Node, Hocuspocus): `onAuthenticate` with main's token, `onLoadDocument`
      (snapshot + log tail), `onChange` (the log), `onStoreDocument` (the fold: snapshot, JSON
      and `plain` by Tiptap's transformer, `pg_notify('doc_folded')`); image, compose service,
      `collab.{$DOMAIN}` in Caddy, `DOC_TOKEN_SECRET` in main and collab_service
- [ ] main: `POST …/pages/{id}/doc-token` (HS256, `mode` from access), `GET …/body.json`
- [ ] Client `shared/collab`: one Hocuspocus socket made when the first editor mounts and closed
      30 s after the last one, a provider per editor with the token as a function (asked on every
      reconnect), `y-indexeddb`, connecting a new page's body only once it has content (else
      `has_content` sees the page as written), the sync indicator, presence from awareness
- [ ] `doc_control` (`pg_notify` from main, collab_service listens): `close` on trash and erase,
      `revoke` on an access change
- [ ] main's derive: `doc_folded` → `page_refs` (migration), mention notifications,
      `page.body_derived`, backlinks; the walk of `json` in `rich_text` (no Yjs in Rust)
- [ ] Revisions in the fold (10 min of editing, the last one leaving), `GET …/body/revisions`,
      Page history in ⋯, restoring as an ordinary edit (§4.4)
- [ ] The trash job: erase pages 30 days after their delete with their bodies and refs; drop
      revisions after 90 days
- [ ] Server-side edits and Duplicate through collab_service's `/internal/docs/…` (§4.6)

Creation (creation spec):
- [ ] No wait for the server: client-made `id` / `shortId` (the API takes them), the page in the
      tree and the address in the same frame, `409` on `shortId` → a new one and `replaceState`
- [ ] The title in the tree and the crumbs at every keystroke (drafts over the cache), PATCH after
      400 ms of quiet; now it is saved on Enter / blur
- [ ] The "new" mark (`--tree-new-mark`, 2 s after 201), the "Not synced yet" dot after 1 s,
      retries 1 · 4 · 15 s and the danger dot with Retry (§05)
- [ ] The type switch under the title while the page is empty (⌥1–3, a radiogroup); the API is
      there (`PATCH { set: { type } }`, `409 PAGE_NOT_EMPTY` → toast)
- [ ] The empty abandoned page removed on leaving it, with "Empty page removed · Undo":
      `DELETE ?if_empty=true` (not built: purge past the trash, `page.deleted` with `purged`)
- [ ] ⌥⌘N / Ctrl+Alt+N: in the tree's cursor node, else in the open page, else at the root
- [ ] Refusals while creating: `403` (row gone, back to the last page, "Copy text"), parent
      deleted (`422 parentId` → at the root with a toast when allowed)
- [ ] Board side data: statuses To do · In progress · Done and the "Board" view, made with a board
      and when a page becomes one, dropped when it stops being one (board tables first, §3)

The canvas (pages spec §6):
- [ ] Header right side: presence avatars, the sync indicator, Share, ⋯ (Copy link ⌘⇧C,
      Duplicate, Move to… ⌘⇧M, Add to Favorites, Hide description, Page history, Delete ⌘⌫)
- [ ] The meta line ("Created just now", "Mira Sato · edited 2h ago")
- [ ] Enter / ↓ at the end of the title → the body (document), the description (board),
      "New page" (group)
- [ ] The icon: "Add icon" over the title, the emoji picker, Remove (`PATCH { set: { icon } }`
      exists). Lucide icons are accepted by the API but drawn as the type's icon
- [ ] The empty document's hint ("Press Enter to start writing, or type / for blocks"); a board's
      "Add a description", "Hide description" (localStorage per page)
- [ ] The board canvas: view tabs, FilterBar, board / table / list (its own spec)
- [ ] The kit Breadcrumbs (spec [UI-kit] Breadcrumbs): the header has a plain trail with no
      collapsing of long paths

Tree and navigation:
- [ ] Undo of a move (the Tree's `onMove` expects the app's undo toast); a failed rename or move
      marks the node (`error`, `onRetry`) instead of only a toast
- [ ] G S (reveal the open page, Sidebar · 09) and the tree's other sidebar hotkeys
- [ ] Expanded nodes are kept for the visit only: keep them per workspace (localStorage)
- [ ] Pages without access (`access: 'none'`, spec §1.2) and the "You don't have access to this
      page · Request access" screen — after page grants
- [ ] The trash list (open, restore, delete forever); a workspace's home = the last opened page
- [ ] Lazy children past 2 000 nodes (`?parent_id=`), not before a workspace gets there
- [ ] Duplicate (body with new block ids, children; a board with statuses and views, no tasks),
      Move to… (the parent picker palette)
- [ ] `/{ws}/t/{KEY}` → the task's board with `?task=` (after tasks)
- [ ] e2e of the tree's own actions: drag to move, F2, delete with Undo

Spec: «Verso — страницы», part 1 (the Yjs version). Started on 2026-10-24 with the migration
(`20261024000000_pages.sql`: `pages`, `page_bodies`, `page_body_updates`, `page_body_revisions`).
To settle with the designer, then fix in the spec or the code:
- [ ] `move { parent_id, position }` makes the client compute the fractional key. Better
      `{ parent_id, index }`, as the kit Tree's `onMove` gives it: the server builds the key and
      rebalances in the same transaction, the client needs no fractional-index code
- [ ] Page access levels (Full / Edit / Comment / View, spec §5) need page grants, and the spec has
      no table for them. Until it does: every member has Full access, and the tree already returns
      `access` so the frontend does not change when grants come
- [ ] §4.4: «Phoenix asks Rust for the right». Decided 2026-10-24: bodies run on Hocuspocus
      (collab_service, Node), not Phoenix; main signs a short-lived token
      (`POST …/pages/{id}/doc-token`, `{ doc, sub, mode: rw | ro, exp }`, HS256), collab_service
      only verifies it and never evaluates access. Revocation: `doc_control` `revoke` closes the
      connections, the provider asks for a new token. Ownership: collab_service writes the
      document (log, snapshot, its JSON and `plain`, revisions), main the meaning (refs,
      notifications). `docs/pages-backend.md` §1, §4, §5
- [ ] The spec does not say how main learns of a fold. Decided: `pg_notify('doc_folded')` inside
      the fold transaction (delivered only on commit), plus a sweep of
      `page_bodies_underived_idx` at start and every minute
- [ ] What happens past the 2 MB snapshot limit (§4.2): refuse further updates, or only warn?
- [ ] No `GET …/body` with the Yjs state (spec §9): the first frame comes from `y-indexeddb`, else
      the provider's sync. If pages never opened on a device render too late, collab_service
      serves the state over HTTP
- [ ] One Hocuspocus instance per document: `seq` is counted in its memory. Several instances
      need the Redis extension and a sticky route per document; the `(doc_id, seq)` key refuses
      a second writer
- [ ] Deviation from §4.2: the body tables carry `workspace_id` (an erased workspace takes its
      bodies), and the log and revisions hang on `page_bodies` by FK, so deleting a body row
      deletes all of it. `doc_id` has no FK to pages or tasks (it is either): the trash job
      deletes the body explicitly
- [ ] The names `page_body_*` also hold task descriptions (`doc_kind = 'task'`): `doc_*` would
      read better; rename before the first code that uses them, or keep
- [ ] Body schema (§4.2): the JSON is made by Tiptap's transformer in collab_service with the
      kit's extensions; main walks that JSON for refs and checks node and mark types and
      attribute types (refs, XSS in `href`) against `rte-schema.json` generated from the kit's
      RTE. Unknown nodes are kept and logged, not refused. No Yjs in Rust
- [ ] Not in the migration yet, by phase: `page_refs` (backlinks, mentions), board tables (§3)
- [ ] Open questions of the spec (§10): templates, `/board` creating a board, public pages

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

- [ ] Typography (asked 2026-10-25): `--weight-medium` 500 for a read notification's line
      (Inbox · 02) against "400 and 600 only" (Typography 03); `--kbd-font-size` 11 px against
      "Kbd is meta, 12 px; 11 does not exist" (Typography 02); `--font-ui` is defined twice with
      different stacks (Roboto in one); where `Text`'s default color should come from — `primary`
      as §08 says, or the surrounding text's

- [ ] Line heights 14/20 and 12/18 in the Inbox spec; the kit's `--lh-body` / `--lh-meta` give
      21 / 16.8
- [ ] Inbox row action icons on the inverse surface: the mock has `--text-muted`, built as
      `--text-secondary`
