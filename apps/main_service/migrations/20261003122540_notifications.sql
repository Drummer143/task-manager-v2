CREATE TABLE IF NOT EXISTS notifications (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id       UUID NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  -- NULL until workspaces exist; then NOT NULL REFERENCES workspaces
  workspace_id  UUID NULL,

  -- NotificationKind as serde writes it: {"kind": ..., "facts": {...}}
  data          JSONB NOT NULL,
  -- Derived from data, so the two never disagree; for filters and indexes only
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

-- The list: a user's notifications, newest event first
CREATE INDEX notifications_user_updated_idx ON notifications (user_id, updated_at DESC, id DESC);

-- The unread counter: only the rows it counts
CREATE INDEX notifications_unread_idx ON notifications (user_id)
  WHERE read_at IS NULL AND archived_at IS NULL;
