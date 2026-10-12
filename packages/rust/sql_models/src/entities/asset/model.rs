use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use sqlx::prelude::FromRow;
use utoipa::ToSchema;
use uuid::Uuid;

/// What an asset belongs to. Reading an asset is reading its owner; a new owner type comes with
/// its entity (and the `CHECK` of `assets.owner_type`).
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, ToSchema, sqlx::Type)]
#[serde(rename_all = "snake_case")]
#[sqlx(type_name = "text", rename_all = "snake_case")]
pub enum AssetOwnerType {
    /// The icon of a workspace; `owner_id` is the workspace.
    WorkspaceIcon,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, ToSchema, sqlx::Type)]
#[serde(rename_all = "snake_case")]
#[sqlx(type_name = "text", rename_all = "snake_case")]
pub enum AssetStatus {
    /// Allowed to upload, the upload has not completed yet.
    Pending,
    /// Backed by a blob.
    Ready,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, ToSchema, sqlx::Type)]
#[serde(rename_all = "snake_case")]
#[sqlx(type_name = "text", rename_all = "snake_case")]
pub enum AssetVisibility {
    /// Only those who may read the owner.
    Private,
    /// Anyone with the link, no sign-in needed.
    Public,
}

/// Verso's reference to a blob: who owns it, under which name, and so who may read it.
#[derive(Debug, Clone, FromRow)]
pub struct Asset {
    pub id: Uuid,
    /// `None` for an account-level asset.
    pub workspace_id: Option<Uuid>,
    pub owner_type: AssetOwnerType,
    pub owner_id: Uuid,
    pub name: String,
    /// Announced when the upload was allowed; the blob must match it.
    pub size: i64,
    pub hash: String,
    /// Set once the upload completed.
    pub blob_id: Option<Uuid>,
    pub status: AssetStatus,
    pub visibility: AssetVisibility,
    pub created_by: Option<Uuid>,
    pub created_at: DateTime<Utc>,
    pub updated_at: DateTime<Utc>,
}
