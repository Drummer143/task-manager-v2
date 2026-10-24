# Pages: backend implementation

How to build the backend of «Verso — страницы», part 1 (the Yjs version) on what this repo already
has. The spec says *what*; this says *where and how*. Where they differ, the deviation is named
and listed in `docs/TODO.md` → Pages, to settle with the designer.

Schema: `apps/main_service/migrations/20261024000000_pages.sql`.

**Built (2026-10-24)**: `apps/main_service/src/pages/` — tree, create, by-short, PATCH (title,
icon, type), move, delete, restore, signals, DB tests (`pages/tests.rs`). Where it differs from
what follows:

- Routes live under the workspace, `/workspaces/{ws}/pages/…` (also `/{id}`, `/{id}/move`,
  `/{id}/restore`, `/by-short/{sid}`): the workspace layer gives every route the member's
  context, and a page of another workspace is `404` by the path alone.
- Create takes an optional client-made `id` and `shortId` (creation spec §02): repeating the
  request answers `200` with the page; a taken client short id is `409` on `shortId`. Without
  them the server makes both.
- Keys are `loro_fractional_index` bytes in hex, made only by the server; the client sends
  `{ parentId, index }` to move and nothing to create (always last).
- Every page has a body row, a group too: the type of an empty page changes (creation spec §01)
  without creating or dropping bodies. "Empty" is `repo::has_content`: no live children and a
  body never written to, checked under a lock on the body row that socket_service's log insert
  (its FK) waits for.
- Guests (members without a role) see no pages until page grants exist.
- Not yet: the doc token, `GET …/body`, `DELETE ?if_empty`, duplicate, board side data.

---

## 1. Who owns what

Two services share one database (main migrates it, socket_service reads and writes a few tables).
Ownership is by **who writes**: every column has one writer; anyone may read.

| Data | Writer | Why |
| --- | --- | --- |
| `pages` (the tree, title, icon, trash) | main | REST, the tree, the field contract |
| `page_bodies` row creation and erasure | main | Created with its page or task, erased by the trash job |
| `page_body_updates`, `page_bodies.snapshot`, `snapshot_seq`, `updated_by/at` | socket_service (`DocRoom`) | Only it holds the live Y.Doc and orders the updates (`seq`) |
| `page_body_revisions` row (`snapshot`, `authors`) | socket_service, in the fold transaction | Only it sees activity and the last person leaving; the revision lands on the exact `seq` |
| `page_bodies.json`, `plain`, `derived_seq`, `page_body_revisions.json`, `page_refs`, mention notifications | main (derive worker) | The meaning of a body: schema, refs, rights in notifications |

In short: **socket_service owns the bytes, main owns the meaning.** main still serves the body over
HTTP (§3.8): reading is not owning.

Rights are decided only by main. socket_service never evaluates page access: it checks a token main
signed (§5). This replaces §4.4 of the spec («Phoenix asks Rust»).

---

## 2. Schema notes

What the code must keep true, beyond what the migration enforces:

- **`position`** is a fractional key, `COLLATE "C"`. Siblings are ordered by `(position, id)`:
  two concurrent inserts may get the same key (there is no unique index, so a restore never
  collides), and `id` breaks the tie the same way everywhere.
- **The parent** is in the same workspace (composite FK). Depth ≤ 12 and "not under itself" are
  checked by main in the move transaction (§3.5).
- **`type`, title length, `icon` shape** are checked in Rust, no `CHECK` constraints.
- **Trash** sets `deleted_at` (one timestamp) and `deleted_root` on the whole subtree.
  `ON DELETE CASCADE` of the parent FK only fires when the trash job erases rows.
- **A body row** exists for every `document` and `board` page and every task, from its creation; a
  `group` never has one. `snapshot IS NULL` with no updates is an empty document.
- **`doc_id`** is the page's or the task's id, no FK to either: the trash job erases the body
  explicitly. The log and the revisions hang on `page_bodies` by FK: erasing the body row erases
  all of it. An erased workspace takes its bodies by `workspace_id`.

---

## 3. main_service

### 3.1 Module layout

As `workspaces/`:

```
src/pages/
  mod.rs
  router.rs          routes under /workspaces/{ws}/pages and /pages/{id}
  controllers/       one file per endpoint
  dto.rs             request and response types (utoipa)
  repo.rs            SQL
  service.rs         PageState + update_page, tree rules, access
  position.rs        fractional keys
  short_id.rs        base58 ids
  updates.rs         data.changed signals
  doc_token.rs       the join token for doc:* (§5)
  body.rs            GET …/body: snapshot + tail merged
src/docs/            the derive worker and the trash job (§4); later also task bodies
packages/rust/rich_text/   Yjs → ProseMirror JSON, plain text, refs (§4.2)
packages/rust/sql_models/src/entities/page/   Page, PageBody models
```

### 3.2 Access

Until page grants exist (TODO → Pages), access is the workspace's:

- Every route under `/workspaces/{ws}` goes through `load_workspace_context`, as now: a non-member
  gets `404`.
- Routes under `/pages/{id}` load the page first, then the `WorkspaceContext` of its workspace: a
  page of a workspace you are not in is `404`, never `403`. Write a `load_page_context` middleware
  next to `load_workspace_context` that does both and hands controllers `(PageContext, Page)`.
- Every member has Full access to every page; the tree returns `access: 'full'` for each node, so
  the frontend is ready for grants.
- Creating at the root needs `Capability::PagesCreateRoot` (it exists); creating under a page needs
  edit access to the parent (always true for now).
- A deleted page is `404` on every route except `restore` and `GET …/by-short` (which answers with
  the trash state, §3.4).

Keep the access decision in one function, `service::page_access(ctx, page) -> Access`, even while it
returns `Full`: grants will change only it.

### 3.3 `GET /workspaces/{ws}/pages` — the tree

One query, every live page of the workspace:

```sql
SELECT id, parent_id, position, type, title, icon, short_id
FROM pages
WHERE workspace_id = $1 AND deleted_at IS NULL
ORDER BY parent_id NULLS FIRST, position, id
```

`pages_tree_idx` covers it. The response is flat (`[{ id, parentId, position, type, title, icon,
shortId, access }]`); the frontend builds the tree. Over 2 000 nodes the spec wants lazy children
(`?parent_id=`): do not build it until a workspace gets there.

A node whose parent is not in the result (cannot happen while access is workspace-wide) would be
shown at the root; with grants, `access: 'none'` nodes come in its place (spec §1.2).

### 3.4 `GET /workspaces/{ws}/pages/by-short/{sid}` — open by address

`{ page, snapshotSeq, docToken, board? }`. The body is a parallel `GET …/body` (binary, cacheable).

- Live page → `200`.
- Trashed page → `200` with `page.deletedAt` and `canRestore`; the frontend shows «This page is in
  Trash» (spec §2). Not `404`: the address is right, the page is just in the trash.
- No such page in this workspace → `404`.
- `docToken` only for pages with a body (§5); `null` for a group.

### 3.5 `POST /workspaces/{ws}/pages` — create

`{ type, parentId?, index?, title? }` → `201 page`.

In one transaction:

1. Validate `type` (`document | board | group`), trim `title`, ≤ 200 chars.
2. Check the parent: same workspace, live, depth of the new page ≤ 12.
3. Lock the siblings' order: `SELECT … FROM pages WHERE id = $parent FOR UPDATE` (or the
   workspace row for the root) so two creates under one parent compute keys one after the other.
4. Position: between the siblings at `index - 1` and `index` (§3.10); no `index` → after the last.
5. `short_id`: 10 random base58 characters (§3.11); on a unique violation of `pages_short_id_key`,
   generate again (at most 3 times, then `500`).
6. Insert the page; for `document` and `board`, insert the body row
   (`doc_id = page.id, doc_kind = 'page', workspace_id`).
7. Commit, then signal `page.created` (§3.12).

The spec has `position?` in the request; this takes `index` instead (TODO → Pages, the same as for
move).

### 3.6 `PATCH /pages/{id}` — title and icon

The field contract of the workspace settings (`{ set: { title?, icon? }, base: { version } }`):

- `PageState { title, icon, parent_id, position, deleted_at, deleted_root }` with `diff()` like
  `WorkspaceState`; one `update_page(tx, current, next, actor_id)` that writes, bumps `version`
  and `updated_at/updated_by`, and records every changed field in `field_changes` with
  `entity_type = 'page'`. PATCH, move, delete and restore all go through it, as for workspaces.
- Conflicts: `changes::repo::conflicts` since `base.version`, the same `409` shape as workspaces.
- `icon`: `{ kind: 'emoji' | 'lucide' | 'asset', value }`; `asset` values are asset ids that must
  exist (and later belong to the workspace).
- Signal `page.updated { id, fields }`; `tree:{ws}` among the tags only when `title` or `icon`
  changed.

### 3.7 `POST /pages/{id}/move`

`{ parentId, index }` → `200 page`. In one transaction:

1. Lock the page; lock the new parent (or the workspace row for the root).
2. Refuse moving under itself: `parentId` must not be the page or one of its descendants:
   ```sql
   WITH RECURSIVE up AS (
     SELECT id, parent_id, 1 AS depth FROM pages WHERE id = $new_parent
     UNION ALL
     SELECT p.id, p.parent_id, up.depth + 1 FROM pages p JOIN up ON p.id = up.parent_id
   )
   SELECT EXISTS (SELECT 1 FROM up WHERE id = $page) AS cycle, max(depth) AS parent_depth FROM up
   ```
   `cycle` → `422 page.cycle`.
3. Depth: `parent_depth + 1 + height of the moved subtree` ≤ 12, else `422 page.too_deep` (the
   height is one more recursive query down from the page).
4. Position from `index` among the new siblings without the moved page (§3.10).
5. `update_page` with the new `parent_id` and `position`; signal `page.moved`.

The kit Tree's `onMove` gives exactly `{ parentId, index }`, counted without the dragged node.

### 3.8 `GET /pages/{id}/body` and `GET /pages/{id}/body.json`

`body`: the snapshot and the log tail merged into one Yjs update, `application/octet-stream`,
`ETag: "<seq>"`, `If-None-Match` → `304`.

```sql
-- REPEATABLE READ: the snapshot and the tail from one moment
SELECT snapshot, snapshot_seq FROM page_bodies WHERE doc_id = $1;
SELECT seq, "update" FROM page_body_updates WHERE doc_id = $1 AND seq > $snapshot_seq ORDER BY seq;
```

Merge with `yrs::merge_updates_v1` (snapshot first, then the tail); the ETag is the last `seq`. A
fold between the two reads cannot break it inside one `REPEATABLE READ` transaction, and even an
overlap would be harmless: applying a Yjs update twice changes nothing.

`body.json`: `{ json, derivedSeq }` from `page_bodies`, for previews and export without Yjs on the
client. `json` may be behind the live document by the debounce of the fold and the derive.

There is no HTTP write of a body: only the channel (§5).

### 3.9 `DELETE /pages/{id}` and `POST /pages/{id}/restore`

Delete, in one transaction: lock the page, then

```sql
WITH RECURSIVE sub AS (
  SELECT id FROM pages WHERE id = $1 AND deleted_at IS NULL
  UNION ALL
  SELECT p.id FROM pages p JOIN sub ON p.parent_id = sub.id WHERE p.deleted_at IS NULL
)
UPDATE pages SET deleted_at = $now, deleted_root = $1, version = version + 1, updated_by = $actor, updated_at = $now
WHERE id IN (SELECT id FROM sub)
```

Pages trashed before, apart, stay with their own `deleted_root`. Record the change of the root
page in `field_changes` (`deletedAt`); the descendants' rows are not history worth keeping.
Signal `page.deleted` to the workspace and the control event to each open document of the subtree
(§5.5). The response carries what Undo needs: just the id, Undo is `restore`.

Restore: every page with `deleted_root = $1`; clear `deleted_at` and `deleted_root`. If the root's
parent is gone or trashed, move the root to the end of the root level (new position) and answer
`restoredToRoot: true` (the frontend toasts «Restored to the top level»). A restore past 30 days
cannot happen: the job erased the rows.

### 3.10 Fractional keys (`position.rs`)

The spec's keys (`a0`, `a0V`) are the format of rocicorp/fractional-indexing: base-62 digits with
an integer-part prefix. Take a maintained Rust port of it if one fits, or port its ~150 lines; the
interface the rest of the code needs:

```rust
fn key_between(before: Option<&str>, after: Option<&str>) -> String;
```

Compute keys only in main. Rebalance when a generated key would exceed 32 characters: give the
siblings of that parent fresh evenly spaced keys in the same transaction (`n_keys_between(None,
None, count)`). Rebalancing changes many rows' `position` but no one's place: it does not bump
their `version` and sends one `page.moved` for the parent.

### 3.11 Short ids (`short_id.rs`)

10 characters of the Bitcoin base58 alphabet (no `0 O I l`) from `rand`'s CSPRNG: 58¹⁰ ≈ 4·10¹⁷,
collisions are retried on the unique violation (§3.5). Never derived from the UUID: it would leak
creation time.

### 3.12 Signals (`updates.rs`)

The existing envelope and `DataChanged`. Kinds and tags (`shared/tags.rs` gets `tree(ws)`,
`page(id)`, `page_preview(id)`, `backlinks(id)`):

| Kind | Topic | Tags |
| --- | --- | --- |
| `page.created`, `page.moved`, `page.deleted`, `page.restored` | `workspace:{ws}` | `tree:{ws}` |
| `page.updated` | `workspace:{ws}` | `page:{id}`, plus `tree:{ws}` for title or icon |
| `page.body_derived` | `workspace:{ws}` | `page-preview:{id}`, `backlinks:{target}` for each target whose refs changed |

The spec also lists `page:{id}` as a topic; the frontend's open page listens to its workspace
channel already, so one topic is enough until there is a reason for a page channel.

`origin` (`X-Client-Id`) as for workspaces, so the tab that made the change skips its own refetch.

### 3.13 Errors

| Code | Status | When |
| --- | --- | --- |
| `page.not_found` | 404 | No such page in a workspace you are in, or trashed (except by-short, restore) |
| `page.invalid_type` | 422 | `type` not one of the three |
| `page.title_too_long` | 422 | Over 200 characters after trimming |
| `page.parent_not_found` | 422 | Parent missing, trashed, or of another workspace |
| `page.cycle` | 422 | Move under itself |
| `page.too_deep` | 422 | Depth over 12 |
| `page.no_body` | 404 | `…/body` of a group |
| field conflict | 409 | The workspace settings' shape |

Use the error helpers of `error_handlers` the way workspaces do.

---

## 4. main_service: background work

### 4.1 Learning of a fold: `LISTEN/NOTIFY`

main has no RabbitMQ consumer, and the fold is a database event. socket_service runs, inside its
fold transaction:

```sql
SELECT pg_notify('doc_folded', $doc_id::text);
```

Postgres delivers a notification only when the transaction commits, so main never hears of a fold
that rolled back. main listens with `sqlx::postgres::PgListener` on `doc_folded`.

Notifications are not durable (none while main is down or reconnecting), so the worker also sweeps
`page_bodies_underived_idx` (`derived_seq < snapshot_seq`) at start, after a reconnect and every
minute. The notification is only "look now".

### 4.2 The derive worker (`src/docs/derive.rs`)

For one `doc_id`:

1. Read `snapshot, snapshot_seq, derived_seq`; nothing to do if `derived_seq >= snapshot_seq`.
2. `rich_text::from_yjs(snapshot)` → ProseMirror JSON (§4.3).
3. `rich_text::plain_text(&json)`, `rich_text::refs(&json)` → `[(block_id, target_kind,
   target_id)]`.
4. In one transaction: `UPDATE page_bodies SET json, plain, derived_seq = $snapshot_seq WHERE
   doc_id = $1 AND derived_seq < $snapshot_seq` (a slower worker never overwrites a newer
   result); replace the doc's rows in `page_refs`; fill `json` of revisions of this doc that have
   none.
5. Mentions new in this derive (in the new refs, not in the old) → notifications through the
   notifications code that exists. The actor is `page_bodies.updated_by` of the fold: the log is
   folded away by then (§5.4).
6. Signal `page.body_derived { id, seq }`.

Run derives per document one at a time (a `HashSet` of docs in progress, or a per-doc lock with
`pg_try_advisory_xact_lock(hashtext(doc_id))`), any number of documents in parallel with a bounded
pool. An unknown node is kept in `json` and logged (spec §4.2), never a failure.

`page_refs` is not in the migration yet: it comes with this worker (TODO → Pages).

### 4.3 `packages/rust/rich_text`

A workspace crate with `yrs` and `serde_json`, no I/O:

- `from_yjs(update: &[u8]) -> Result<Value>`: apply the update to a fresh `yrs::Doc`, read the
  `XmlFragment` the client edits (Tiptap's Collaboration `field`, `"default"` unless the kit sets
  another; keep the name in one constant shared with the kit) and convert:
  - `XmlElement` → node: its name is the node type, its attributes the node's `attrs`;
  - `XmlText` → text nodes from its delta: each run's formatting attributes are the marks (key =
    mark name, value = mark attrs). y-prosemirror suffixes the key of marks that may overlap
    (`comment--<hash>`): strip the suffix to get the mark name.
- `plain_text(&Value) -> String`: text of the leaves, a newline between blocks.
- `refs(&Value) -> Vec<Ref>`: `pageRef { pageId }`, `taskRef { taskId }`, `mention { userId |
  roleId }`, `boardView { boardId, viewId }`, each with the `attrs.id` of the block it is in.
- `validate(&Value, &Schema)` later, from the kit's generated `rte-schema.json` (TODO → Pages).

Test it with fixtures made by the real client: a small script in the kit that builds documents
with Tiptap + y-prosemirror and writes the encoded updates and the expected JSON to files the
crate's tests read. The conversion is where the two sides can drift.

### 4.4 The trash job (`src/docs/trash.rs`)

A loop like `assets::cleanup::spawn`, every hour:

1. Pages with `deleted_at < now() - 30 days`, oldest first, a batch at a time.
2. For each subtree root: delete the body rows of its pages (cascades to the log and revisions),
   the `page_refs` whose source is one of these pages, and later the board's tasks. Refs from
   other documents to these pages stay: they render «Deleted page» while the target is in the
   trash and are dropped here too once the target is erased.
3. Delete the root page: the parent FK cascades to the subtree.

Also daily: revisions older than 90 days (`page_body_revisions_created_idx`).

---

## 5. socket_service

### 5.1 The join token

main signs, socket_service verifies; no call between them on join.

- Payload `{ doc: "page:<uuid>", sub: "<user uuid>", mode: "rw" | "ro", exp }`, HS256 with a secret
  both services read from their config (`DOC_TOKEN_SECRET`; never logged, never in responses).
  `jsonwebtoken` is already a dependency of main; socket_service has a JWT verifier for the
  session token (`auth_verifier/`), reuse its library.
- Lifetime 5 minutes: it only needs to outlive the join. A rejoin (reconnect, access change) asks
  main for a fresh one through `by-short`.
- `mode` comes from `page_access` (§3.2): Full and Can edit → `rw`, Can comment and Can view →
  `ro`.

### 5.2 `doc:{kind}:{id}` channel (`channels/doc.ex`)

`join("doc:" <> rest, %{"token" => token}, socket)`:

1. Verify the token: signature, `exp`, `sub == socket.assigns.user_id`, `doc == rest`. Anything
   wrong → `{:error, %{reason: "not_found"}}`, as for workspaces.
2. Start or find the document's `DocRoom` (§5.3) and register the channel process with it
   (monitored: a dying channel leaves the room).
3. Assign `mode`.

Messages, y-protocols over the channel as binary payloads (`{:binary, data}` both ways; the
client provider sends `ArrayBuffer`s):

- `sync_step1` from the client → reply `sync_step2` (what it lacks, from the room's doc) and send
  the room's own `sync_step1` so the client sends back what the server lacks.
- `update` from the client: `ro` → reply `read_only`, drop it. `rw` → the room applies it.
- `awareness` from anyone (viewers too: their avatars show) → broadcast to the room's other
  channels as is; the room keeps the latest awareness per client to send to newcomers.

Use the y-protocols message encoding exactly (varint type tags): the client library decodes it.
If `y_ex` brings a sync module for Phoenix channels, use it rather than hand-encoding.

### 5.3 `DocRoom` (`docs/doc_room.ex`)

A GenServer per open document, started under a `DynamicSupervisor`, found through a `Registry`
by doc id (`{:via, Registry, {SocketService.DocRegistry, doc_id}}`).

State: the `Yex.Doc`, `seq` (last written), the channels joined, awareness, `authors` since the
last revision, timers.

- **Start**: load the snapshot and the log tail (as main does in §3.8), apply them, `seq` = last
  seq. The room is the only writer of this document's log from now on.
- **Update**: apply to the doc; `seq + 1`; insert into `page_body_updates` (`doc_id, seq, update,
  user_id`) and only then broadcast to the other channels and ack. If the insert fails, the room
  crashes and the clients resync from the database on rejoin: an update is never shown to others
  without being stored.
- **Fold**: after 2 s without updates, or every 200 updates — one transaction:
  1. `snapshot = Yex.encode_state_as_update(doc)`, `snapshot_seq = seq`, `updated_by` = last
     author, `updated_at`;
  2. `DELETE FROM page_body_updates WHERE doc_id = $1 AND seq <= $seq`;
  3. a revision row if one is due (§5.4);
  4. `pg_notify('doc_folded', doc_id)`.
- **Leave**: when the last channel leaves, fold (with a revision), wait 30 s for a rejoin, then
  stop. A rejoin within 30 s cancels the stop.
- **Size**: an update that would push the snapshot past 2 MB — the spec does not say yet (TODO →
  Pages); until it does, accept and log.

`Yex.Doc` is a NIF resource: keep all calls on it in the room process.

### 5.4 Revisions and authors

The room keeps `authors` (user ids of updates since the last revision) and the time editing became
active. In the fold, insert a revision `(doc_id, seq, snapshot, authors)` when 10 minutes of active
editing have passed since the last revision, or when the last person leaves; then reset
`authors`. `json` of the revision is filled by the derive worker (§4.2).

Mentions need their author after the log is folded: the derive worker takes `updated_by` of the
fold as the actor of the mentions new in it. With several editors between two folds this credits
the last one; if the designer wants exact authors of mentions, the fold must keep per-update
authors (an `authors` column with `(seq, user_id)` pairs) — not before it is asked for.

### 5.5 Control events from main

main sends documents what changes outside them through the existing signals path: the consumer
broadcasts envelopes by topic, so main publishes to the topic `doc:page:<id>` and the consumer's
`allowed_topic?` learns the `doc:` prefix. The channel intercepts (`intercept/1`, `handle_out/3`)
instead of pushing them on:

| Event | From | Channel does |
| --- | --- | --- |
| `doc.access_changed` | `page.access_changed`, member removed | Push `access_revoked` and leave; the client asks for a new token and rejoins `ro` or shows no access |
| `doc.deleted` | page trashed (each page of the subtree with a body) | Push `deleted` and leave; the room stops after its fold |
| `doc.apply` `{ update }` | server-side edits (templates, «/board» in an existing document) | The room applies it as an update from main (no `user_id`) |

main never writes `page_body_updates` of a document itself, or `seq` would have two writers;
`doc.apply` goes through the room. A room that is not running starts for it. Duplicate is
different: the copy is a new document with no room yet, so main writes its snapshot directly
(with new block ids: the copy's blocks must not share anchors with the original).

### 5.6 Several nodes

`seq` needs exactly one room per document across the cluster. On one node the `Registry` is
enough. On several: a global registry (`:global`, Horde) and a handover on node loss. The
`(doc_id, seq)` primary key refuses a second writer's insert, so a split brain crashes a room
rather than corrupting a log. Not before there is a second node.

---

## 6. Tests

Following what the repo does:

- **main, DB tests** (throwaway Postgres): create (keys between, short id, body row only for
  bodies), tree order with equal keys, PATCH conflicts, move (cycle, depth, index without the
  moved page), delete/restore of subtrees with an inner page trashed earlier, restore to the root,
  `by-short` of a trashed page, `body` merge with a concurrent fold, ETag/304, signals via
  `Signals::recorded()`.
- **main, unit**: `position` (ordering, rebalancing), `short_id` alphabet, `doc_token` sign/verify,
  `rich_text` against the client-made fixtures (§4.3).
- **socket_service**: token verification (wrong doc, wrong user, expired), `ro` refusing updates,
  room: update written before broadcast, fold deletes the folded log and notifies, revision on
  leave, control events closing channels. A fake repo for the room as for `Workspaces`.

---

## 7. Order of work

1. `pages` CRUD in main: tree, create, PATCH, move, delete, restore, by-short (without the token),
   signals. The frontend can build the sidebar tree and the canvas header on it.
2. `rich_text` with the fixtures; `GET …/body`, `body.json`.
3. socket_service: token, `doc:*` channel, `DocRoom` with log, fold and `pg_notify`; main signs
   the token in by-short. The kit RTE with Collaboration on top.
4. Derive worker, `page_refs`, `page.body_derived`, mention notifications.
5. Revisions, the trash job, control events, duplicate.
