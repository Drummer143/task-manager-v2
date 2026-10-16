use chrono::{DateTime, Utc};
use serde::Serialize;
use sql_models::workspace::model::Workspace;
use utoipa::ToSchema;
use uuid::Uuid;

/// A workspace as its members see it.
#[derive(Debug, Serialize, ToSchema)]
#[serde(rename_all = "camelCase")]
pub struct WorkspaceResponse {
    pub id: Uuid,
    pub name: String,
    /// In URLs: `/{slug}/inbox`.
    pub slug: String,
    /// In task keys: `TM` in `TM-248`.
    pub task_prefix: String,
    /// The icon; `None` draws the first letter of the name. Public, so the frontend builds its
    /// link itself: `{storage}/public/files/{iconAssetId}`.
    pub icon_asset_id: Option<Uuid>,

    /// `baseVersion` for `PATCH`.
    pub version: i64,
    pub created_at: DateTime<Utc>,

    /// Set only for the owner, while the workspace can still be restored (30 days).
    pub deleted_at: Option<DateTime<Utc>>,
}

impl From<Workspace> for WorkspaceResponse {
    fn from(value: Workspace) -> Self {
        Self {
            id: value.id,
            name: value.name,
            slug: value.slug,
            task_prefix: value.task_prefix,
            icon_asset_id: value.icon_asset_id,
            version: value.version,
            created_at: value.created_at,
            deleted_at: None,
        }
    }
}
