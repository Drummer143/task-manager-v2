-- Every change of a tracked field, one row per field. Two uses: edit conflicts (a field changed
-- after the client's base_version, backend spec §5.3) and, later, the change history in the UI
CREATE TABLE field_changes (
  -- 'workspace' | 'role' | …, checked in Rust
  entity_type   TEXT NOT NULL,
  -- Polymorphic, so no FK
  entity_id     UUID NOT NULL,
  -- The entity's version this change produced: every field of one edit shares it
  version       BIGINT NOT NULL,
  -- As the API names it ('name', 'slug', 'taskPrefix', 'iconAssetId'): conflicts and the history
  -- show it to the client as is
  field         TEXT NOT NULL,
  old_value     JSONB NULL,
  new_value     JSONB NULL,
  actor_id      UUID NULL REFERENCES users (id) ON DELETE SET NULL,
  -- Whose data it is: a workspace's history in one query, gone with an erased workspace. NULL for
  -- account-level entities
  workspace_id  UUID NULL REFERENCES workspaces (id) ON DELETE CASCADE,
  at            TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

  -- Also what the conflict check walks: one entity, versions after the client's
  PRIMARY KEY (entity_type, entity_id, version, field)
);

-- A workspace's history, newest first
CREATE INDEX field_changes_workspace_idx ON field_changes (workspace_id, at DESC);
