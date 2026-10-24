# Pages: backend implementation

How to build the backend of «Verso — страницы», part 1 (the Yjs version), and of
«[Страницы] Создание страницы», on what this repo has. The specs say *what*; this says *where and
how*. Where they differ, the deviation is named and listed in `docs/TODO.md` → Pages, to settle
with the designer.

Schema: `apps/main_service/migrations/20261024000000_pages.sql`.

**Decided 2026-10-24: bodies run on Hocuspocus** (Tiptap's collaboration server, real Yjs) in a
new Node service, `collab_service`, not on `y_ex` in socket_service: the reference Yjs with the
reference y-prosemirror, and the Yjs → ProseMirror JSON conversion done by Tiptap's own code
instead of a port in Rust. socket_service keeps the workspace and user signals.

---

## 1. Who owns what

Three services share one database (main migrates it; the others read and write a few tables).
Ownership is by **who writes**: every column has one writer; anyone may read.

| Data | Writer | Why |
| --- | --- | --- |
| `pages` (tree, title, icon, type, trash) | main | REST, the tree, the field contract |
| `page_bodies` row creation and erasure | main | Made with its page or task, erased by the trash job |
| `page_body_updates`, `page_bodies.snapshot`, `snapshot_seq`, `updated_by/at` | collab_service | Only it holds the live Y.Doc and orders the updates (`seq`) |
| `page_bodies.json`, `plain`, `derived_seq` | collab_service, in the fold | Tiptap's transformer is the reference Yjs → ProseMirror JSON |
| `page_body_revisions` (`snapshot`, `json`, `authors`) | collab_service, in the fold | It sees activity and the last person leaving; the revision lands on its exact `seq` |
| `page_refs`, mention notifications, `page.body_derived` | main | Meaning that needs rights and notifications: read from `json`, no Yjs in Rust |

In short: **collab_service owns the document** (bytes and their JSON), **main owns what it
means for others** (refs, backlinks, notifications) **and who may open it**. Rights are decided
only by main: collab_service checks a token main signed (§5.2).

---

## 2. Schema notes

What the code must keep true, beyond what the migration enforces:

- **`position`** is a `loro_fractional_index` key in hex, `COLLATE "C"`, made only by main.
  Siblings are ordered by `(position, id)`: equal keys (two pages placed at once) are possible,
  there is no unique index, so a restore never collides.
- **The parent** is in the same workspace (composite FK). Depth ≤ 12 and "not under itself" are
  checked by main in the move transaction.
- **`type`, title length, `icon` shape** are checked in Rust, no `CHECK` constraints.
- **Trash** sets `deleted_at` (one timestamp) and `deleted_root` on the whole subtree.
  `ON DELETE CASCADE` of the parent FK only fires when the trash job erases rows.
- **Every page has a body row**, a group too (it shows none), and every task will: the type of an
  empty page changes without creating or dropping bodies. `snapshot IS NULL` with no log rows is
  a body nobody ever wrote to — the "empty" of the creation spec (§3.4).
- **`doc_id`** is the page's or the task's id, no FK to either: the trash job erases the body
  explicitly. The log and the revisions hang on `page_bodies` by FK; an erased workspace takes
  its bodies by `workspace_id`.

---

## 3. main_service

### 3.1 Built (2026-10-24)

`apps/main_service/src/pages/`, routes under the workspace layer (the member's context comes with
the path; a page of another workspace is `404` by the path alone):

| Route | What |
| --- | --- |
| `GET /workspaces/{ws}/pages` | The live tree, flat, ordered `parent_id, position, id`, each node with `access` and `version` |
| `POST …/pages` | Create, last under its parent, with its body row. Optional client-made `id` and `shortId`: the same request again is `200` with the page; a taken client `shortId` is `409` on `shortId` |
| `GET …/pages/by-short/{sid}` | Open by address, live or trashed (`deletedAt`, `deletedRoot`) |
| `PATCH …/pages/{id}` | Title, icon, type — the field contract with conflicts per field. The type only while empty: `409 PAGE_NOT_EMPTY` |
| `POST …/pages/{id}/move` | `{ parentId, index }` (index without the page, as the kit Tree gives it); `PAGE_CYCLE`, `PAGE_TOO_DEEP` |
| `DELETE …/pages/{id}` | The subtree to the trash |
| `POST …/pages/{id}/restore` | Back with its subtree; at the root (`restoredToRoot`) when its parent is gone |

Signals: `page.created / moved / deleted / restored` → tags `tree:{ws}`, `page:{id}`;
`page.updated` → `page:{id}`, plus `tree:{ws}` when the title, icon or type changed. Guests
(members without a role) see no pages until page grants exist. DB tests: `pages/tests.rs`.

### 3.2 The doc token (to build)

`POST /workspaces/{ws}/pages/{id}/doc-token` → `{ token, mode }`. A short-lived HS256 JWT:

```json
{ "doc": "page:<uuid>", "sub": "<user uuid>", "mode": "rw" | "ro", "exp": <now + 5 min> }
```

- Signed with `DOC_TOKEN_SECRET`, which main and collab_service read from their config. Never
  logged, never in a response but as the token itself.
- `mode` from `service::access` (Full, Can edit → `rw`; Can comment, Can view → `ro`).
- Its own endpoint, not a field of `by-short`: the provider asks for a token on every
  (re)connect, long after the page was opened (§5.3).
- A trashed page or a page without a body type that shows it (a group) gets no token: `404`.

### 3.3 `GET …/pages/{id}/body.json` (to build)

`{ json, derivedSeq }` from `page_bodies`, for previews, export and the board's description in
places without an editor. No Yjs on the client for it. `json` may be behind the live document by
the fold's debounce.

There is no `GET …/body` with the Yjs state: the first frame comes from `y-indexeddb` when the
page was opened on this device, else from the provider's sync, which is one round trip on an
open socket. The spec's §4.4 "first frame before the socket" is met by IndexedDB; if it proves
slow for pages never opened here, collab_service can serve the state over HTTP (Hocuspocus runs
next to an HTTP server) — not before it is needed.

### 3.4 `DELETE …/pages/{id}?if_empty=true` (to build)

The empty abandoned page (creation spec §02): in one transaction, lock the page and its body row
(`repo::lock_body`, the same lock the type switch takes), check `has_content` plus an empty title
and no icon; `409 PAGE_NOT_EMPTY` if anything is there; else delete the rows outright (no trash)
and signal `page.deleted` with `purged: true`. collab_service's log insert waits on the body lock
(its FK), so nothing is written between the check and the delete.

### 3.5 Refs and mentions (to build)

main listens to `doc_folded` (§4.3) and, for each folded document:

1. Reads `json`, `derived_seq`; walks the JSON (`packages/rust/rich_text`: refs only, plain JSON,
   no Yjs) for `pageRef { pageId }`, `taskRef { taskId }`, `mention { userId | roleId }`,
   `boardView { boardId, viewId }`, each with the `attrs.id` of its block.
2. Replaces the document's rows in `page_refs` (migration with this work).
3. Mentions new since the last derive → notifications through the existing code; the actor is
   `page_bodies.updated_by`.
4. Signals `page.body_derived { id, seq }` → tags `page-preview:{id}`, `backlinks:{target}`.

`GET …/pages/{id}/backlinks` reads `page_refs` with the reader's rights.

Node and mark validation against the kit's schema (`rte-schema.json`, generated from the RTE's
extensions) runs here too: unknown nodes are kept and logged, never refused.

### 3.6 The trash job (to build)

A loop like `assets::cleanup::spawn`, hourly: pages with `deleted_at < now() - 30 days`, a batch at
a time. For each: `pg_notify('doc_control', { op: 'close', doc })` for open documents, delete the
body rows of its subtree (the log and revisions go with them by FK), the `page_refs` they are the
source of, later the board's tasks; then the root page (the parent FK cascades to its subtree).
Daily: revisions older than 90 days.

---

## 4. collab_service

### 4.1 Shape

`apps/collab_service`: Node + TypeScript, an Nx project like the others; `@hocuspocus/server`,
`@tiptap/extension-*` for the transformer's schema (the kit's RTE extensions, imported from the
kit so both sides have one list), `postgres` (or `pg`) for the database, `jose` for the token.

- Port 8083 inside the Docker network; Caddy serves it on `collab.{$DOMAIN}` (WebSocket).
- `/internal/*` (server-side edits, §4.6) stays off the internet, as for main.
- Image: `docker/Dockerfile.collab`, an entry in `.github/images.json`, a service in
  `docker-compose.prod.yml` with `DATABASE_URL`, `DOC_TOKEN_SECRET`.

### 4.2 Hooks

| Hook | Does |
| --- | --- |
| `onAuthenticate` | Verify the token (`jose`, HS256): signature, `exp`, `doc === documentName`. `mode: 'ro'` → `connection.readOnly = true` (Hocuspocus drops their updates). Keep `{ userId }` in the context. Anything wrong → throw: the provider gets `authenticationFailed` |
| `onLoadDocument` | Read `snapshot` and the log tail (`seq > snapshot_seq`), apply them to the new Y.Doc; remember the last `seq` for this document |
| `onChange` | Per update: `seq + 1`, insert into `page_body_updates` (`doc_id, seq, update, user_id`). Hocuspocus broadcasts the update to the others at once; the insert is what survives a crash before the next fold. If it fails, log it: the fold stores the full state anyway |
| `onStoreDocument` | The fold, debounced (`debounce: 2000`, `maxDebounce: 10000`): see §4.3 |
| `onDisconnect` | Last connection gone: a revision is due at the next fold (§4.4) |

Document names: `page:{uuid}`, later `task:{uuid}`. One Hocuspocus instance holds a document at a
time, so the `seq` counter in memory is the only writer; the `(doc_id, seq)` key refuses a second
one. Several instances need the Redis extension and a sticky route per document — not before a
second instance.

### 4.3 The fold

One transaction:

1. `snapshot = Y.encodeStateAsUpdate(doc)`, `snapshot_seq = seq`, `updated_by` = the last
   author, `updated_at`.
2. `json = TiptapTransformer.fromYdoc(doc, 'default')` with the kit's extensions; `plain` from
   it (text of the leaves, a newline between blocks); `derived_seq = seq`.
3. `DELETE FROM page_body_updates WHERE doc_id = $1 AND seq <= $seq`.
4. A revision row when due (§4.4).
5. `SELECT pg_notify('doc_folded', $doc_id)` — delivered to main only on commit (§3.5).

The Tiptap `field` (the fragment's name) is `"default"` unless the kit sets another: keep it in
one constant shared by the kit and collab_service.

### 4.4 Revisions and authors

Keep, per document, the user ids of the updates since the last revision and when editing became
active. In the fold, insert `(doc_id, seq, snapshot, json, authors)` when 10 minutes of active
editing have passed since the last revision, or when the last person left; then reset them.
Kept 90 days (main's job deletes older ones).

### 4.5 Control from main: `doc_control`

main sends documents what changes outside them by `pg_notify('doc_control', json)` inside its own
transaction (delivered only on commit); collab_service `LISTEN`s:

| `op` | When | collab_service does |
| --- | --- | --- |
| `close` | a page trashed (each page of the subtree), erased | `closeConnections(doc)`, unload without a store |
| `revoke` | `page.access_changed`, a member removed | `closeConnections(doc)`: the providers reconnect, ask main for a new token (§5.3) and come back `ro` or not at all |

Notifications are not durable: a missed `close` only leaves an open editor until its next
reconnect, where the token request fails. That is acceptable; a missed `revoke` is bounded by the
token's 5 minutes the same way.

### 4.6 Server-side edits (later)

Templates, "/board" inserting a view into an existing document: main calls
`POST /internal/docs/{name}/apply { update }` (service token, Docker network only);
collab_service applies it through `openDirectConnection`, so it goes through `onChange` like any
edit. main never writes `page_body_updates` itself. Duplicate goes the same way:
`POST /internal/docs/{name}/copy-to/{new name}` makes the new document from the old one's state
with new block ids (the copy's blocks must not share anchors with the original), so the Yjs work
stays in collab_service.

---

## 5. The client

### 5.1 One socket, only while an editor is open

The kit's RTE takes a provider; the app makes them through one module (`shared/collab`):

- One `HocuspocusProviderWebsocket` for the tab, made **lazily** when the first editor mounts
  (a page with a body, a task's description) — not at sign-in.
- Each editor gets a `HocuspocusProvider({ websocketProvider, name: 'page:<id>', token })` and
  destroys it on unmount. Documents share the socket (Hocuspocus multiplexes them).
- When the last provider is gone, the socket closes after an idle 30 s, so moving from page to
  page does not reconnect. The Phoenix socket stays as it is: two sockets only while editing.

### 5.2 Offline and the first frame

`y-indexeddb` per document name: the editor renders the local copy at once, the provider syncs
the difference. Edits made offline wait there and merge on reconnect. Kept 7 days after a revoked
access (spec §4.4).

Connect a new page's body only once it has content (the first character, a block): until then
nothing is written, and main's `has_content` keeps seeing the page as empty, so the type switch
and the abandoned-page cleanup work. `UniqueID` would otherwise write an id into the empty
paragraph on open.

### 5.3 The token

`token` is a function: on every (re)connect it calls `POST …/pages/{id}/doc-token`. A `404` or
`403` there → the editor turns read-only with "You can no longer edit this page"; `mode: 'ro'` →
`editable: false` and "View only" in the header.

### 5.4 What the canvas shows

- The sync indicator from the provider: `synced` and `unsyncedChanges` — empty when all is sent,
  "Syncing…" after 1 s of unsent changes, "Offline · changes saved on this device" while the
  socket is down, "Read only".
- Presence from awareness (`CollaborationCaret` with the user's name and a colour from the hash of
  their id): up to 3 avatars and "+N" in the header.
- `Y.UndoManager` (Collaboration's undo) undoes one's own edits only.

---

## 6. Tests

- **main, DB tests** (throwaway Postgres): the doc token (mode by access, `404` for a trashed
  page), `if_empty` (refused when a log row exists, purges otherwise), refs from a `json`, the
  trash job. Signals via `Signals::recorded()`.
- **collab_service**: hooks against a throwaway Postgres — a refused token, `ro` dropping
  updates, an update written to the log, the fold (snapshot, JSON, log deleted, `doc_folded`
  heard by a `LISTEN`), a revision on the last disconnect, `doc_control` closing connections.
  Two `HocuspocusProvider`s in the same test process are enough for a two-client edit.
- **frontend**: the collab module (lazy socket, idle close, token refresh on reconnect) with a
  fake provider; e2e with a real collab_service is a later, separate suite.

---

## 7. Order of work

1. collab_service skeleton: Hocuspocus with `onAuthenticate` (token), `onLoadDocument` /
   `onChange` / `onStoreDocument` on the existing tables; main's doc-token endpoint.
2. The kit RTE with Collaboration and CollaborationCaret; the app's `shared/collab` (lazy socket,
   providers, IndexedDB) on the page canvas.
3. The fold's JSON and `plain`, `doc_folded`; main's refs, mentions, backlinks.
4. Revisions, `doc_control`, the trash job, `if_empty`.
5. Deploy: image, compose service, `collab.{$DOMAIN}` in Caddy, `DOC_TOKEN_SECRET` in both
   services' env.
