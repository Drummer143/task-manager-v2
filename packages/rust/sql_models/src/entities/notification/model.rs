use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use sqlx::prelude::FromRow;
use utoipa::ToSchema;
use uuid::Uuid;

#[derive(Debug, Serialize, Deserialize, ToSchema)]
// `kind` values are snake_case (the spec's names: `due_soon`, `page_shared`), the fields inside
// `facts` are camelCase like the rest of the API
#[serde(
    tag = "kind",
    content = "facts",
    rename_all = "snake_case",
    rename_all_fields = "camelCase"
)]
pub enum NotificationKind {
    Assigned {},
    Unassigned {},
    Mentioned {},
    Commented {},
    StatusChanged {},
    DueSoon {},
    Overdue {},
    PageShared {},
    Debug { message: String },
}

#[derive(Debug, Serialize, FromRow, ToSchema)]
#[serde(rename_all = "camelCase")]
pub struct Notification {
    pub id: Uuid,
    pub user_id: Uuid,
    /// `None` until workspaces exist.
    pub workspace_id: Option<Uuid>,

    #[sqlx(json)]
    #[serde(flatten)]
    pub data: NotificationKind,

    // TODO: TEMPORARILY DISABLED
    // pub task_id: Option<Uuid>, // references tasks,
    // pub page_id: Option<Uuid>, // references pages,
    // pub comment_id: Option<Uuid>,
    // amount of actors in this notification
    // pub actor_ids: Vec<Uuid>,
    // pub actor_count: i32,
    // amount of events in this notification
    // pub count: i32,
    // pub facts: serde_json::Value,
    pub created_at: DateTime<Utc>,
    pub updated_at: DateTime<Utc>,
    pub read_at: Option<DateTime<Utc>>,
    pub archived_at: Option<DateTime<Utc>>,
}

#[cfg(test)]
mod tests {
    use serde_json::{Value, json};

    use super::*;

    fn notification(data: NotificationKind) -> Notification {
        let at = DateTime::parse_from_rfc3339("2026-10-03T10:00:00Z")
            .unwrap()
            .to_utc();
        Notification {
            id: Uuid::nil(),
            user_id: Uuid::nil(),
            workspace_id: None,
            data,
            created_at: at,
            updated_at: at,
            read_at: None,
            archived_at: None,
        }
    }

    // `data` column and API body share this shape; `kind` is also a generated column in SQL
    #[test]
    fn a_kind_is_written_as_kind_and_facts() {
        let debug = NotificationKind::Debug {
            message: "hello".into(),
        };

        assert_eq!(
            serde_json::to_value(&debug).unwrap(),
            json!({ "kind": "debug", "facts": { "message": "hello" } })
        );
        assert_eq!(
            serde_json::to_value(NotificationKind::DueSoon {}).unwrap(),
            json!({ "kind": "due_soon", "facts": {} })
        );
    }

    #[test]
    fn every_kind_reads_back_what_it_writes() {
        let kinds = [
            NotificationKind::Assigned {},
            NotificationKind::Unassigned {},
            NotificationKind::Mentioned {},
            NotificationKind::Commented {},
            NotificationKind::StatusChanged {},
            NotificationKind::DueSoon {},
            NotificationKind::Overdue {},
            NotificationKind::PageShared {},
            NotificationKind::Debug {
                message: "hello".into(),
            },
        ];

        for kind in kinds {
            let value = serde_json::to_value(&kind).unwrap();
            let back: NotificationKind = serde_json::from_value(value.clone()).unwrap();
            assert_eq!(serde_json::to_value(back).unwrap(), value);
        }
    }

    #[test]
    fn rejects_unknown_kinds_and_missing_facts() {
        let read = |v: Value| serde_json::from_value::<NotificationKind>(v);

        assert!(read(json!({ "kind": "fired", "facts": {} })).is_err());
        assert!(read(json!({ "kind": "debug", "facts": {} })).is_err());
        assert!(read(json!({ "facts": { "message": "hello" } })).is_err());
    }

    // The frontend reads one flat object: a discriminated union on `kind`
    #[test]
    fn a_notification_is_flat_and_camel_case() {
        let value = serde_json::to_value(notification(NotificationKind::Debug {
            message: "hello".into(),
        }))
        .unwrap();

        assert_eq!(value["kind"], "debug");
        assert_eq!(value["facts"], json!({ "message": "hello" }));
        assert!(value.get("data").is_none());
        for key in [
            "userId",
            "workspaceId",
            "createdAt",
            "updatedAt",
            "readAt",
            "archivedAt",
        ] {
            assert!(value.get(key).is_some(), "missing {key}");
        }
    }
}
