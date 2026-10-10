DROP INDEX IF EXISTS notifications_user_updated_idx;
CREATE INDEX notifications_user_workspace_updated_idx
  ON notifications (user_id, workspace_id, updated_at DESC, id DESC);

DROP INDEX IF EXISTS notifications_unread_idx;
CREATE INDEX notifications_unread_idx ON notifications (user_id, workspace_id)
  WHERE read_at IS NULL AND archived_at IS NULL;
