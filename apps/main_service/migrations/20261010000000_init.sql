CREATE TABLE users (
  id            UUID PRIMARY KEY,
  authentik_id  INTEGER UNIQUE,
  username      TEXT NOT NULL,
  email         TEXT,
  picture       TEXT,
  is_active     BOOLEAN NOT NULL DEFAULT TRUE,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX users_email_idx ON users (email);

CREATE TABLE notifications (
  id            UUID PRIMARY KEY DEFAULT uuidv7(),
  user_id       UUID NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  workspace_id  UUID NULL,

  data          JSONB NOT NULL,
  kind          TEXT NOT NULL GENERATED ALWAYS AS (data->>'kind') STORED,

  -- TODO: DISABLED BECAUSE ENTITIES ARE NOT YET IMPLEMENTED
  -- task_id       UUID NULL REFERENCES tasks,
  -- page_id       UUID NULL REFERENCES pages,
  -- comment_id    UUID NULL,
  -- amount of actors in this notification
  -- actor_ids     UUID[] NOT NULL DEFAULT '{}',
  -- actor_count   INT NOT NULL DEFAULT 0,
  -- amount of events in this notification
  -- count         INT NOT NULL DEFAULT 1,

  -- updated_at is the time of the last event, not of the last read or archive: lists sort by it
  created_at    TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  read_at       TIMESTAMPTZ NULL,
  archived_at   TIMESTAMPTZ NULL
);

-- The list of one workspace's (or the account-level) notifications, newest event first.
-- A btree keeps the NULLs too, so the account list walks it as well
CREATE INDEX notifications_user_workspace_updated_idx
  ON notifications (user_id, workspace_id, updated_at DESC, id DESC);

-- The unread counts, grouped by workspace: only the rows they count
CREATE INDEX notifications_unread_idx ON notifications (user_id, workspace_id)
  WHERE read_at IS NULL AND archived_at IS NULL;
