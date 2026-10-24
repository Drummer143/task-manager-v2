-- Pages (pages spec, part 1): the tree of a workspace. Documents, boards and groups are all rows
-- here; what only a board has (statuses, views, tasks) lives in its own tables, keyed by the page
CREATE TABLE pages (
  id            UUID PRIMARY KEY DEFAULT uuidv7(),
  workspace_id  UUID NOT NULL REFERENCES workspaces (id) ON DELETE CASCADE,
  -- NULL: at the root of the workspace. Any page may have children, not only a group
  parent_id     UUID NULL,
  -- Fractional key among the siblings (loro_fractional_index bytes in hex), made only by the
  -- server. "C": the keys compare byte by byte, as the algorithm assumes; a locale collation would
  -- order them differently. Equal keys (two pages placed at once) are ordered by id
  position      TEXT COLLATE "C" NOT NULL,
  -- 'document' | 'board' | 'group', checked in Rust; changes only while the page is empty
  type          TEXT NOT NULL,
  -- 0–200 characters, trimmed; empty is shown as "Untitled"
  title         TEXT NOT NULL DEFAULT '',
  -- { kind: 'emoji' | 'lucide' | 'asset', value }; NULL: the type's icon
  icon          JSONB NULL,
  -- 10 characters of base58, made by the client or the server: the page's address, /{ws}/p/{short_id}
  short_id      TEXT NOT NULL UNIQUE,
  -- base_version of the command contract (title, icon, the place in the tree)
  version       BIGINT NOT NULL DEFAULT 1,
  created_by    UUID NULL REFERENCES users (id) ON DELETE SET NULL,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_by    UUID NULL REFERENCES users (id) ON DELETE SET NULL,
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  -- Trash: set on the deleted page and every page under it, all with one time
  deleted_at    TIMESTAMPTZ NULL,
  -- The page the delete was made on: a restore brings back its subtree, not pages trashed apart
  deleted_root  UUID NULL,

  -- Target of the parent FK: a parent from another workspace cannot be attached
  UNIQUE (workspace_id, id),
  -- A parent is erased with its children (the trash job). NULL parent_id is not checked
  FOREIGN KEY (workspace_id, parent_id) REFERENCES pages (workspace_id, id) ON DELETE CASCADE
);

-- The tree of a workspace, and the children of one page in their order
CREATE INDEX pages_tree_idx ON pages (workspace_id, parent_id, position) WHERE deleted_at IS NULL;
-- Restore: the subtree trashed by one delete
CREATE INDEX pages_deleted_root_idx ON pages (deleted_root) WHERE deleted_root IS NOT NULL;
-- The trash of a workspace, and the job that erases pages 30 days after their delete
CREATE INDEX pages_deleted_idx ON pages (workspace_id, deleted_at) WHERE deleted_at IS NOT NULL;

-- Bodies are Yjs documents (spec §4.2): of a page (a document, the text above a board) and of a task's
-- description. `doc_id` is the page's or the task's id: no FK to either, so a body goes with its
-- owner explicitly (the trash job), and with its workspace by the FK below. Every page (a group
-- too, which shows none) and every task gets its row at creation: changing the type of an empty
-- page never creates or drops a body
CREATE TABLE page_bodies (
  doc_id        UUID PRIMARY KEY,
  -- 'page' | 'task', checked in Rust
  doc_kind      TEXT NOT NULL,
  workspace_id  UUID NOT NULL REFERENCES workspaces (id) ON DELETE CASCADE,
  -- Y.encodeStateAsUpdate of everything up to snapshot_seq, GC on; at most 2 MB. NULL: nothing
  -- folded yet (the document is its log, or empty)
  snapshot      BYTEA NULL,
  snapshot_seq  BIGINT NOT NULL DEFAULT 0,
  -- Derived by the server from the snapshot, never written by clients: ProseMirror JSON (search,
  -- preview, export, page_refs) and its text for search
  json          JSONB NULL,
  plain         TEXT NOT NULL DEFAULT '',
  -- Up to which seq json, plain and the refs are built
  derived_seq   BIGINT NOT NULL DEFAULT 0,
  -- The last edit, from the log: the canvas' meta line
  updated_by    UUID NULL REFERENCES users (id) ON DELETE SET NULL,
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- What the derive worker has left to do: after it was down, it catches up from here
CREATE INDEX page_bodies_underived_idx ON page_bodies (doc_id) WHERE derived_seq < snapshot_seq;

-- Every Yjs update as it came from a client, written at once: nothing is lost if the document's
-- process falls. The process folds the log into the snapshot and deletes what it folded
CREATE TABLE page_body_updates (
  doc_id   UUID NOT NULL REFERENCES page_bodies (doc_id) ON DELETE CASCADE,
  -- In the document; given by its one process, so the order is the order it applied them
  seq      BIGINT NOT NULL,
  "update" BYTEA NOT NULL,
  user_id  UUID NULL REFERENCES users (id) ON DELETE SET NULL,
  at       TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

  PRIMARY KEY (doc_id, seq)
);

-- Page history: a snapshot every 10 minutes of active editing and when the last person leaves,
-- kept 90 days
CREATE TABLE page_body_revisions (
  doc_id      UUID NOT NULL REFERENCES page_bodies (doc_id) ON DELETE CASCADE,
  seq         BIGINT NOT NULL,
  snapshot    BYTEA NOT NULL,
  json        JSONB NULL,
  -- Who edited since the previous revision
  authors     UUID[] NOT NULL DEFAULT '{}',
  created_at  TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

  PRIMARY KEY (doc_id, seq)
);

-- The job that drops revisions older than 90 days
CREATE INDEX page_body_revisions_created_idx ON page_body_revisions (created_at);
