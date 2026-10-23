use chrono::{DateTime, Utc};
use serde::Serialize;
use utoipa::ToSchema;
use uuid::Uuid;

/// What kind of entity a change belongs to; `field_changes.entity_type`.
#[derive(Debug, Clone, Copy, PartialEq, Eq, sqlx::Type)]
#[sqlx(type_name = "text", rename_all = "snake_case")]
pub enum Entity {
    Workspace,
    Role,
}

/// One field's change, about to be recorded.
#[derive(Debug, Clone, PartialEq)]
pub struct FieldChange {
    /// The API's name of the field.
    pub field: &'static str,
    pub old: serde_json::Value,
    pub new: serde_json::Value,
}

impl FieldChange {
    /// The change of `field`, or `None` when the value stays the same: a field sent as it is
    /// neither bumps the version nor shows in the history.
    pub fn if_changed<T: Serialize + PartialEq>(
        field: &'static str,
        old: &T,
        new: &T,
    ) -> Option<Self> {
        (old != new).then(|| Self {
            field,
            old: serde_json::to_value(old).expect("a field value serializes"),
            new: serde_json::to_value(new).expect("a field value serializes"),
        })
    }
}

/// A field someone else changed after the version the client edited.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, ToSchema, sqlx::FromRow)]
#[serde(rename_all = "camelCase")]
pub struct FieldConflict {
    /// The API's name of the field.
    pub field: String,
    /// Who changed it last; `None` once they deleted their account.
    #[sqlx(rename = "actor_id")]
    pub by: Option<Uuid>,
    /// When it was changed last.
    pub at: DateTime<Utc>,
}

#[cfg(test)]
mod tests {
    use serde_json::json;

    use super::*;

    #[test]
    fn an_unchanged_value_is_no_change() {
        assert_eq!(FieldChange::if_changed("name", &"Verso", &"Verso"), None);
        assert_eq!(
            FieldChange::if_changed::<Option<Uuid>>("iconAssetId", &None, &None),
            None
        );
    }

    #[test]
    fn a_changed_value_keeps_both_sides_as_json() {
        let icon = Uuid::from_u128(7);

        assert_eq!(
            FieldChange::if_changed("name", &"Verso team", &"Verso Labs"),
            Some(FieldChange {
                field: "name",
                old: json!("Verso team"),
                new: json!("Verso Labs"),
            })
        );
        assert_eq!(
            FieldChange::if_changed("iconAssetId", &Some(icon), &None),
            Some(FieldChange {
                field: "iconAssetId",
                old: json!(icon.to_string()),
                new: json!(null),
            })
        );
    }

    #[test]
    fn a_conflict_is_written_in_camel_case() {
        let conflict = FieldConflict {
            field: "slug".into(),
            by: None,
            at: DateTime::parse_from_rfc3339("2026-10-18T10:00:00Z")
                .unwrap()
                .to_utc(),
        };

        assert_eq!(
            serde_json::to_value(conflict).unwrap(),
            json!({ "field": "slug", "by": null, "at": "2026-10-18T10:00:00Z" })
        );
    }
}
