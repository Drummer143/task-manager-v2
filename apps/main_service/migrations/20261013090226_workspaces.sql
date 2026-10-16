CREATE TABLE workspaces (
  id             UUID PRIMARY KEY DEFAULT uuidv7(),
  name           TEXT NOT NULL,
  -- Unique on the instance; a deleted workspace keeps its slug for the 30 days of restore
  slug           TEXT NOT NULL UNIQUE,
  task_prefix    TEXT NOT NULL,
  icon_asset_id  UUID NULL REFERENCES assets (id) ON DELETE SET NULL,
  -- Grows on any change of roles, their members, capabilities or grants; keys the access cache
  access_epoch   BIGINT NOT NULL DEFAULT 0,
  -- base_version of the command contract
  version        BIGINT NOT NULL DEFAULT 1,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  deleted_at     TIMESTAMPTZ NULL
);

-- Old slugs redirect for 90 days (access §9.2)
CREATE TABLE workspace_slug_aliases (
  slug          TEXT PRIMARY KEY,
  workspace_id  UUID NOT NULL REFERENCES workspaces (id) ON DELETE CASCADE,
  expires_at    TIMESTAMPTZ NOT NULL
);

-- Every task prefix the workspace has had: a key with any of them resolves by number (access §1.1)
CREATE TABLE workspace_prefixes (
  workspace_id  UUID NOT NULL REFERENCES workspaces (id) ON DELETE CASCADE,
  prefix        TEXT NOT NULL,
  used_from     TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  -- NULL: the current one
  used_until    TIMESTAMPTZ NULL,

  PRIMARY KEY (workspace_id, prefix)
);

CREATE TABLE members (
  workspace_id    UUID NOT NULL REFERENCES workspaces (id) ON DELETE CASCADE,
  user_id         UUID NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  is_owner        BOOLEAN NOT NULL DEFAULT FALSE,
  invited_by      UUID NULL REFERENCES users (id) ON DELETE SET NULL,
  joined_at       TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  -- Reserved for SCIM
  deactivated_at  TIMESTAMPTZ NULL,

  PRIMARY KEY (workspace_id, user_id)
);

-- At most one owner; "exactly one" is the job of the create and transfer transactions
CREATE UNIQUE INDEX members_one_owner_idx ON members (workspace_id) WHERE is_owner;
-- "My workspaces"
CREATE INDEX members_user_idx ON members (user_id);

CREATE TABLE roles (
  id            UUID PRIMARY KEY DEFAULT uuidv7(),
  workspace_id  UUID NOT NULL REFERENCES workspaces (id) ON DELETE CASCADE,
  name          TEXT NOT NULL,
  slug          TEXT NOT NULL,
  -- One of the 8 label colors
  color         SMALLINT NOT NULL,
  description   TEXT NULL,
  -- 'admin' | 'member' for the two built-in roles, NULL for the ones people create
  builtin       TEXT NULL,
  -- Capability names (access §2.3). Admin has every grantable one and stores none
  capabilities  TEXT[] NOT NULL DEFAULT '{}',
  position      INT NOT NULL,
  created_by    UUID NULL REFERENCES users (id) ON DELETE SET NULL,
  version       BIGINT NOT NULL DEFAULT 1,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  -- Soft: Undo of a delete brings it back with its members
  deleted_at    TIMESTAMPTZ NULL,

  -- Target of the composite FKs below: a role of another workspace cannot be attached
  UNIQUE (workspace_id, id)
);

CREATE UNIQUE INDEX roles_name_idx ON roles (workspace_id, lower(name)) WHERE deleted_at IS NULL;
CREATE UNIQUE INDEX roles_slug_idx ON roles (workspace_id, slug) WHERE deleted_at IS NULL;
-- One Admin and one Member per workspace
CREATE UNIQUE INDEX roles_builtin_idx ON roles (workspace_id, builtin) WHERE builtin IS NOT NULL;

CREATE TABLE member_roles (
  workspace_id  UUID NOT NULL,
  user_id       UUID NOT NULL,
  role_id       UUID NOT NULL,
  added_by      UUID NULL REFERENCES users (id) ON DELETE SET NULL,
  added_at      TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

  PRIMARY KEY (workspace_id, user_id, role_id),

  -- Removing a member removes their roles (access §2.5)
  FOREIGN KEY (workspace_id, user_id) REFERENCES members (workspace_id, user_id) ON DELETE CASCADE,
  FOREIGN KEY (workspace_id, role_id) REFERENCES roles (workspace_id, id) ON DELETE CASCADE
);

-- A role's members: the editor's list and the counts
CREATE INDEX member_roles_role_idx ON member_roles (role_id);

-- "Managed by": members of manager_role_id may give and take role_id (role.members:{role_id}).
-- A role never manages itself; Admin manages every role and is not listed
CREATE TABLE role_managers (
  workspace_id     UUID NOT NULL,
  role_id          UUID NOT NULL,
  manager_role_id  UUID NOT NULL,

  PRIMARY KEY (role_id, manager_role_id),

  FOREIGN KEY (workspace_id, role_id) REFERENCES roles (workspace_id, id) ON DELETE CASCADE,
  FOREIGN KEY (workspace_id, manager_role_id) REFERENCES roles (workspace_id, id) ON DELETE CASCADE
);

-- Email invites and invite links (access §3.2). The token is not stored:
-- base64url(id) + "." + base64url(HMAC-SHA256(INVITE_SECRET, id))
CREATE TABLE invites (
  id            UUID PRIMARY KEY DEFAULT uuidv7(),
  workspace_id  UUID NOT NULL REFERENCES workspaces (id) ON DELETE CASCADE,
  -- 'email' | 'link'
  kind          TEXT NOT NULL,
  -- email: the address, as typed; compared lowercased. NULL for a link
  email         TEXT NULL,
  -- [{page_id, level}]: only an invite from a page's Share (one page). No FK: pages do not exist yet
  page_grants   JSONB NULL,
  -- The roles are given in their name, filtered by their rights at every join. NULL: they deleted
  -- their account; a link of someone who left the workspace still points to them
  created_by    UUID NULL REFERENCES users (id) ON DELETE SET NULL,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  -- email: 14 days, extended by Resend. link: its own, NULL = never
  expires_at    TIMESTAMPTZ NULL,
  -- email: always 1. link: NULL = no limit
  max_uses      INT NULL,
  uses          INT NOT NULL DEFAULT 0,
  -- link only, optional
  label         TEXT NULL,
  -- email: the last time the letter went out (Resend at most once in 10 minutes)
  sent_at       TIMESTAMPTZ NULL,
  revoked_at    TIMESTAMPTZ NULL,
  -- email: undone by undecline within 60 s (access §3.4)
  declined_at   TIMESTAMPTZ NULL,
  -- email: who accepted and when; a link counts its uses instead
  accepted_by   UUID NULL REFERENCES users (id) ON DELETE SET NULL,
  accepted_at   TIMESTAMPTZ NULL,
  -- Target of the composite FK of invite_roles
  UNIQUE (workspace_id, id)
);

-- One open email invite per address in a workspace: inviting again updates it (access §3.2)
CREATE UNIQUE INDEX invites_open_email_idx ON invites (workspace_id, lower(email))
  WHERE kind = 'email' AND accepted_at IS NULL AND revoked_at IS NULL;
-- At sign-in: the open invites for this address, to notify an account that has just appeared
CREATE INDEX invites_email_lookup_idx ON invites (lower(email))
  WHERE kind = 'email' AND accepted_at IS NULL AND revoked_at IS NULL;
-- The Invites tab: links and email invites of a workspace, newest first
CREATE INDEX invites_workspace_idx ON invites (workspace_id, kind, created_at DESC);

-- The roles an invite gives; empty — the person joins as a guest. A deleted role is skipped at
-- join (soft-deleted roles stay here, filtered out)
CREATE TABLE invite_roles (
  workspace_id  UUID NOT NULL,
  invite_id     UUID NOT NULL,
  role_id       UUID NOT NULL,
  PRIMARY KEY (invite_id, role_id),
  FOREIGN KEY (workspace_id, invite_id) REFERENCES invites (workspace_id, id) ON DELETE CASCADE,
  FOREIGN KEY (workspace_id, role_id) REFERENCES roles (workspace_id, id) ON DELETE CASCADE
);

-- Both stay nullable: NULL is account-level. A workspace erased after its 30 days takes them along
ALTER TABLE notifications
  ADD FOREIGN KEY (workspace_id) REFERENCES workspaces (id) ON DELETE CASCADE;
ALTER TABLE assets
  ADD FOREIGN KEY (workspace_id) REFERENCES workspaces (id) ON DELETE CASCADE;