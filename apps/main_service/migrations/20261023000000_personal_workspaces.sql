-- Everyone has a personal workspace: created at their first `/me`, never deleted or transferred,
-- so there is always a workspace to open and an Inbox for invites to land in. Existing users get
-- theirs at their next `/me`: the creation is the same code as for a new one
ALTER TABLE workspaces
  ADD COLUMN personal_of UUID NULL REFERENCES users (id) ON DELETE CASCADE;

-- One personal workspace per user
CREATE UNIQUE INDEX workspaces_personal_of_idx ON workspaces (personal_of)
  WHERE personal_of IS NOT NULL;
