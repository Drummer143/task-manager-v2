use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use sqlx::{
    prelude::{FromRow, Type},
    types::Json,
};
use utoipa::ToSchema;
use uuid::Uuid;

/// `pages.type` (pages spec §1.1). Changes only while the page is empty.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Type, Serialize, Deserialize, ToSchema)]
#[sqlx(type_name = "text", rename_all = "snake_case")]
#[serde(rename_all = "snake_case")]
pub enum PageType {
    /// Text.
    Document,
    /// Tasks with statuses, text above them.
    Board,
    /// A folder for other pages; it has no text of its own.
    Group,
}

/// `pages.icon`: `{ kind, value }`. No icon: the icon of the page's type.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, ToSchema)]
#[serde(tag = "kind", content = "value", rename_all = "snake_case")]
pub enum PageIcon {
    /// One emoji.
    Emoji(String),
    /// A Lucide icon by its name, `kebab-case`.
    Lucide(String),
    /// An uploaded image. Not accepted yet: there is no picker for it.
    Asset(Uuid),
}

#[derive(Debug, Clone, FromRow)]
pub struct Page {
    pub id: Uuid,
    pub workspace_id: Uuid,
    /// `None`: at the root of the workspace.
    pub parent_id: Option<Uuid>,
    /// Fractional key among the siblings; they are ordered by `(position, id)`.
    pub position: String,
    pub r#type: PageType,
    /// Trimmed, may be empty: shown as "Untitled".
    pub title: String,
    pub icon: Option<Json<PageIcon>>,
    /// The page's address: `/{ws}/p/{short_id}`.
    pub short_id: String,
    pub version: i64,
    pub created_by: Option<Uuid>,
    pub updated_by: Option<Uuid>,

    pub created_at: DateTime<Utc>,
    pub updated_at: DateTime<Utc>,
    /// In the trash since, with every page under it.
    pub deleted_at: Option<DateTime<Utc>>,
    /// The page the delete was made on: a restore brings back its subtree.
    pub deleted_root: Option<Uuid>,
}

/// A Yjs body: of a page, or of a task's description (`doc_kind`).
#[derive(Debug, Clone, FromRow)]
pub struct PageBody {
    pub doc_id: Uuid,
    pub doc_kind: String,
    pub workspace_id: Uuid,
    pub snapshot: Option<Vec<u8>>,
    pub snapshot_seq: i64,
    pub json: Option<Json<serde_json::Value>>,
    pub plain: String,
    pub derived_seq: i64,
    pub updated_by: Option<Uuid>,
    pub updated_at: DateTime<Utc>,
}

#[derive(Debug, Clone, FromRow)]
pub struct PageBodyUpdate {
    pub doc_id: Uuid,
    pub seq: i64,
    pub update: Vec<u8>,
    pub user_id: Option<Uuid>,
    pub at: DateTime<Utc>,
}

#[derive(Debug, Clone, FromRow)]
pub struct PageBodyRevision {
    pub doc_id: Uuid,
    pub seq: i64,
    pub snapshot: Vec<u8>,
    pub json: Option<Json<serde_json::Value>>,
    pub authors: Vec<Uuid>,
    pub created_at: DateTime<Utc>,
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn an_icon_is_kind_and_value_in_snake_case() {
        let icon: PageIcon = serde_json::from_str(r#"{"kind":"emoji","value":"📘"}"#).unwrap();
        assert_eq!(icon, PageIcon::Emoji("📘".into()));
        assert_eq!(
            serde_json::to_value(PageIcon::Lucide("file-text".into())).unwrap(),
            serde_json::json!({ "kind": "lucide", "value": "file-text" })
        );
    }

    #[test]
    fn a_type_is_its_name_in_snake_case() {
        assert_eq!(serde_json::to_value(PageType::Group).unwrap(), "group");
        assert!(serde_json::from_str::<PageType>(r#""database""#).is_err());
    }
}
