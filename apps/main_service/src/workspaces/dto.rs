use chrono::{DateTime, Utc};
use serde::{Deserialize, Deserializer, Serialize};
use sql_models::workspace::model::{Role, Workspace};
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

    /// Its owner's personal workspace: it can't be deleted, transferred or left.
    pub is_personal: bool,
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
            is_personal: value.personal_of.is_some(),
        }
    }
}

#[derive(Debug, Serialize, ToSchema, Clone)]
#[serde(rename_all = "camelCase")]
pub struct RoleShortResponse {
    pub id: Uuid,
    pub name: String,
    pub slug: String,
    pub color: i16,
}

impl From<Role> for RoleShortResponse {
    fn from(role: Role) -> Self {
        Self {
            id: role.id,
            name: role.name,
            slug: role.slug,
            color: role.color,
        }
    }
}

#[derive(Serialize, ToSchema)]
pub struct CapabilitiesResponse {
    #[serde(rename = "workspace.settings")]
    pub workspace_settings: bool,
    #[serde(rename = "workspace.export")]
    pub workspace_export: bool,

    #[serde(rename = "members.view")]
    pub members_view: bool,
    #[serde(rename = "members.invite")]
    pub members_invite: bool,
    #[serde(rename = "members.remove")]
    pub members_remove: bool,

    #[serde(rename = "roles.assign")]
    pub roles_assign: Vec<Uuid>,
    #[serde(rename = "roles.manage")]
    pub roles_manage: bool,

    #[serde(rename = "pages.create_root")]
    pub pages_create_root: bool,

    #[serde(rename = "labels.create")]
    pub labels_create: bool,
    #[serde(rename = "labels.manage")]
    pub labels_manage: bool,

    #[serde(rename = "workspace.delete")]
    pub workspace_delete: bool,
    #[serde(rename = "workspace.transfer")]
    pub workspace_transfer: bool,
    #[serde(rename = "billing.manage")]
    pub billing_manage: bool,
}

/// The fields of a workspace an edit sets; a field left out stays as it is.
#[derive(Debug, Default, Deserialize, ToSchema)]
#[serde(rename_all = "camelCase")]
pub struct ChangeSet {
    pub name: Option<String>,
    pub slug: Option<String>,
    pub task_prefix: Option<String>,
    /// `null` removes the icon; leaving the field out keeps it.
    #[serde(default, deserialize_with = "present")]
    #[schema(value_type = Option<Uuid>, nullable)]
    pub icon_asset_id: Option<Option<Uuid>>,
}

/// Tells a field sent as `null` (`Some(None)`) from a field left out (`None`, by `default`).
fn present<'de, D, T>(deserializer: D) -> Result<Option<Option<T>>, D::Error>
where
    D: Deserializer<'de>,
    T: Deserialize<'de>,
{
    Option::<T>::deserialize(deserializer).map(Some)
}

/// The names of a workspace's fields in the API: in validation errors, edit conflicts and
/// `field_changes`.
pub mod fields {
    pub const NAME: &str = "name";
    pub const SLUG: &str = "slug";
    pub const TASK_PREFIX: &str = "taskPrefix";
    pub const ICON_ASSET_ID: &str = "iconAssetId";
    /// Set by delete, cleared by restore; never sent in an edit.
    pub const DELETED_AT: &str = "deletedAt";
}

impl ChangeSet {
    pub fn is_empty(&self) -> bool {
        self.name.is_none()
            && self.slug.is_none()
            && self.task_prefix.is_none()
            && self.icon_asset_id.is_none()
    }
}
