-- Bytes, addressed by their blake3 hash: one row per content on the whole instance. A blob has no
-- rights and belongs to no one; access is only ever checked on an asset. storage_service writes
-- this table, main_service migrates it like every other
CREATE TABLE blobs (
  id          UUID PRIMARY KEY DEFAULT uuidv7(),
  hash        TEXT NOT NULL UNIQUE,
  size        BIGINT NOT NULL,
  path        TEXT NOT NULL,
  mime_type   TEXT NOT NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- Reference to a blob: what it belongs to, under which name, and so who may read it
CREATE TABLE assets (
  -- UUIDv7 from the client, like every entity it creates
  id            UUID PRIMARY KEY,
  -- NULL: an account-level asset. Its FK to workspaces comes with the workspaces migration
  workspace_id  UUID NULL,
  -- What the asset belongs to; reading it is reading the owner. Polymorphic, so no FK on owner_id.
  -- A new owner type comes with its entity
  owner_type    TEXT NOT NULL,
  owner_id      UUID NOT NULL,
  name          TEXT NOT NULL,
  -- Announced when the upload is allowed, checked against the blob when it completes
  size          BIGINT NOT NULL,
  hash          TEXT NOT NULL,
  -- Set when storage reports the upload done. RESTRICT: a blob an asset still uses cannot go
  blob_id       UUID NULL REFERENCES blobs (id) ON DELETE RESTRICT,
  status        TEXT NOT NULL DEFAULT 'pending',
  -- public: anyone with the link, no sign-in (a workspace icon is shown on /join too)
  visibility    TEXT NOT NULL,
  created_by    UUID NULL REFERENCES users (id) ON DELETE SET NULL,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX assets_owner_idx ON assets (owner_type, owner_id);
-- Blob garbage collection: which of these blobs does an asset still use
CREATE INDEX assets_blob_idx ON assets (blob_id) WHERE blob_id IS NOT NULL;
-- Abandoned uploads, removed after a day
CREATE INDEX assets_pending_idx ON assets (created_at) WHERE status = 'pending';
