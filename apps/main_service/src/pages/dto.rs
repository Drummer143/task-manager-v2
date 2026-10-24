use chrono::{DateTime, Utc};
use serde::{Deserialize, Deserializer, Serialize};
use sql_models::page::model::{Page, PageIcon, PageType};
use utoipa::ToSchema;
use uuid::Uuid;

/// What the user may do with a page (pages spec §5). Until pages have their own grants, every
/// member has Full access to every page; the field is here so the frontend does not change when
/// they come.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, ToSchema)]
#[serde(rename_all = "snake_case")]
pub enum PageAccess {
    Full,
}

/// A page in the tree: what the sidebar, breadcrumbs and links draw.
#[derive(Debug, Serialize, ToSchema)]
#[serde(rename_all = "camelCase")]
pub struct PageNodeResponse {
    pub id: Uuid,
    /// `null`: at the root.
    pub parent_id: Option<Uuid>,
    /// Orders the siblings, compared as strings; equal ones by `id`.
    pub position: String,
    pub r#type: PageType,
    /// May be empty: shown as "Untitled".
    pub title: String,
    pub icon: Option<PageIcon>,
    pub short_id: String,
    pub access: PageAccess,
    /// `baseVersion` for a rename right in the tree.
    pub version: i64,
}

impl PageNodeResponse {
    pub fn new(page: Page, access: PageAccess) -> Self {
        Self {
            id: page.id,
            parent_id: page.parent_id,
            position: page.position,
            r#type: page.r#type,
            title: page.title,
            icon: page.icon.map(|icon| icon.0),
            short_id: page.short_id,
            access,
            version: page.version,
        }
    }
}

/// A page as it is opened.
#[derive(Debug, Serialize, ToSchema)]
#[serde(rename_all = "camelCase")]
pub struct PageResponse {
    pub id: Uuid,
    pub workspace_id: Uuid,
    pub parent_id: Option<Uuid>,
    pub position: String,
    pub r#type: PageType,
    pub title: String,
    pub icon: Option<PageIcon>,
    pub short_id: String,
    pub access: PageAccess,

    /// `baseVersion` for `PATCH`.
    pub version: i64,
    pub created_by: Option<Uuid>,
    pub created_at: DateTime<Utc>,
    pub updated_by: Option<Uuid>,
    pub updated_at: DateTime<Utc>,

    /// In the trash since. Only `by-short` and `restore` answer with a trashed page.
    pub deleted_at: Option<DateTime<Utc>>,
    /// The page the delete was made on: the one to restore. Itself when it was deleted on its own.
    pub deleted_root: Option<Uuid>,
}

impl PageResponse {
    pub fn new(page: Page, access: PageAccess) -> Self {
        Self {
            id: page.id,
            workspace_id: page.workspace_id,
            parent_id: page.parent_id,
            position: page.position,
            r#type: page.r#type,
            title: page.title,
            icon: page.icon.map(|icon| icon.0),
            short_id: page.short_id,
            access,
            version: page.version,
            created_by: page.created_by,
            created_at: page.created_at,
            updated_by: page.updated_by,
            updated_at: page.updated_at,
            deleted_at: page.deleted_at,
            deleted_root: page.deleted_root,
        }
    }
}

#[derive(Debug, Deserialize, ToSchema)]
#[serde(rename_all = "camelCase")]
pub struct CreatePageRequest {
    /// Made by the client (UUIDv7), so the page has its address before the server answers. The
    /// same request again answers with the page it made. Left out: the server makes one.
    pub id: Option<Uuid>,
    /// Made by the client, 10 characters of base58. Taken: `409`, make another. Left out: the
    /// server makes one.
    pub short_id: Option<String>,
    pub r#type: PageType,
    /// `null` or left out: at the root, which needs `pages.create_root`.
    pub parent_id: Option<Uuid>,
    pub title: Option<String>,
    pub icon: Option<PageIcon>,
}

#[derive(Debug, Deserialize, ToSchema)]
#[serde(rename_all = "camelCase")]
pub struct PatchPageRequest {
    /// The `version` the edit was made on.
    pub base_version: i64,
    pub set: PageChangeSet,
}

/// The fields of a page an edit sets; a field left out stays as it is.
#[derive(Debug, Default, Deserialize, ToSchema)]
#[serde(rename_all = "camelCase")]
pub struct PageChangeSet {
    pub title: Option<String>,
    /// `null` removes the icon; leaving the field out keeps it.
    #[serde(default, deserialize_with = "present")]
    #[schema(value_type = Option<PageIcon>, nullable)]
    pub icon: Option<Option<PageIcon>>,
    /// Only while the page is empty: no text in its body, no children. Else `409 PAGE_NOT_EMPTY`.
    pub r#type: Option<PageType>,
}

impl PageChangeSet {
    pub fn is_empty(&self) -> bool {
        self.title.is_none() && self.icon.is_none() && self.r#type.is_none()
    }
}

/// Tells a field sent as `null` (`Some(None)`) from a field left out (`None`, by `default`).
fn present<'de, D, T>(deserializer: D) -> Result<Option<Option<T>>, D::Error>
where
    D: Deserializer<'de>,
    T: Deserialize<'de>,
{
    Option::<T>::deserialize(deserializer).map(Some)
}

#[derive(Debug, Deserialize, ToSchema)]
#[serde(rename_all = "camelCase")]
pub struct MovePageRequest {
    /// `null`: to the root, which needs `pages.create_root` when the page comes from elsewhere.
    pub parent_id: Option<Uuid>,
    /// The place among the new siblings, counted without the moved page (as the kit Tree's
    /// `onMove` gives it). Past the end: last.
    pub index: u32,
}

#[derive(Debug, Serialize, ToSchema)]
#[serde(rename_all = "camelCase")]
pub struct RestorePageResponse {
    pub page: PageResponse,
    /// Its parent was gone or in the trash: the page came back at the root instead ("Restored to
    /// the top level").
    pub restored_to_root: bool,
}

/// The names of a page's fields in the API: in validation errors, edit conflicts and
/// `field_changes`.
pub mod fields {
    pub const ID: &str = "id";
    pub const SHORT_ID: &str = "shortId";
    pub const TITLE: &str = "title";
    pub const ICON: &str = "icon";
    pub const TYPE: &str = "type";
    /// Set by create and move.
    pub const PARENT_ID: &str = "parentId";
    pub const POSITION: &str = "position";
    /// Set by delete, cleared by restore; never sent in an edit.
    pub const DELETED_AT: &str = "deletedAt";
}

#[cfg(test)]
mod tests {
    use serde_json::json;

    use super::*;

    #[test]
    fn a_null_icon_removes_it_and_a_missing_one_keeps_it() {
        let set = |value| serde_json::from_value::<PageChangeSet>(value).unwrap();

        assert_eq!(set(json!({ "icon": null })).icon, Some(None));
        assert_eq!(set(json!({ "title": "Q3" })).icon, None);
        assert!(set(json!({})).is_empty());
    }
}
