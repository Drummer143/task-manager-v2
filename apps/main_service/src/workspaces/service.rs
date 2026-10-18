use chrono::{DateTime, Duration, Utc};
use error_handlers::{ApiError, ErrorCode, FieldError};
use serde::Deserialize;
use sql_models::workspace::model::Workspace;
use sqlx::{PgConnection, Postgres};
use utoipa::ToSchema;
use uuid::Uuid;

use crate::{
    changes::{
        self,
        dto::{Entity, FieldChange},
    },
    workspaces::{
        dto::fields,
        repo::{self, WorkspaceFields},
        utils::{validate_task_prefix, validate_workspace_name, validate_workspace_slug},
    },
};

#[derive(Deserialize, ToSchema)]
#[serde(rename_all = "camelCase")]
pub struct CreateWorkspaceRequest {
    pub id: Uuid,
    pub name: String,
    pub slug: Option<String>,
    pub task_prefix: Option<String>,
}

// WORKSPACE

pub async fn validate_create_workspace_fields(
    executor: impl sqlx::Executor<'_, Database = Postgres>,
    id: Option<&Uuid>,
    name: Option<&str>,
    slug: Option<&str>,
    task_prefix: Option<&str>,
) -> error_handlers::Result<()> {
    let mut errors: Vec<FieldError> = Vec::new();

    if let Some(id) = id
        && id.get_version_num() != 7
    {
        errors.push(FieldError::new("id", ErrorCode::InvalidFormat));
    }

    if let Some(name) = name
        && let Err(code) = validate_workspace_name(name)
    {
        errors.push(FieldError::new("name", code));
    }

    if let Some(slug) = slug
        && let Err(code) = validate_workspace_slug(slug)
    {
        errors.push(FieldError::new("slug", code));
    }

    if let Some(task_prefix) = task_prefix
        && let Err(code) = validate_task_prefix(task_prefix)
    {
        errors.push(FieldError::new("taskPrefix", code));
    }

    if !errors.is_empty() {
        return Err(ApiError::validation(errors));
    }

    if let Some(slug) = slug
        && repo::is_slug_taken(executor, slug).await?
    {
        return Err(ApiError::new(ErrorCode::Conflict)
            .with_field_errors(vec![FieldError::new("slug", ErrorCode::Taken)]));
    }

    Ok(())
}

// UPDATE

/// How long a deleted workspace can be restored; then a job deletes it for good.
pub const RESTORE_WINDOW_DAYS: i64 = 30;

/// Whether a workspace deleted at `deleted_at` can still be restored (and seen by its owner).
pub fn is_restorable(deleted_at: DateTime<Utc>) -> bool {
    deleted_at > Utc::now() - Duration::days(RESTORE_WINDOW_DAYS)
}

/// The `UNIQUE` of `workspaces.slug`: someone took the slug between the check and the write.
const SLUG_CONSTRAINT: &str = "workspaces_slug_key";

/// A workspace's fields as a change leaves them: start from the current ones and set what the
/// change sets.
#[derive(Debug, Clone, PartialEq)]
pub struct WorkspaceState {
    pub name: String,
    pub slug: String,
    pub task_prefix: String,
    pub icon_asset_id: Option<Uuid>,
    pub deleted_at: Option<DateTime<Utc>>,
}

impl From<&Workspace> for WorkspaceState {
    fn from(workspace: &Workspace) -> Self {
        Self {
            name: workspace.name.clone(),
            slug: workspace.slug.clone(),
            task_prefix: workspace.task_prefix.clone(),
            icon_asset_id: workspace.icon_asset_id,
            deleted_at: workspace.deleted_at,
        }
    }
}

impl WorkspaceState {
    /// The fields that differ from `current`, with both values, as the history keeps them.
    pub fn diff(&self, current: &Workspace) -> Vec<FieldChange> {
        [
            FieldChange::if_changed(fields::NAME, &current.name, &self.name),
            FieldChange::if_changed(fields::SLUG, &current.slug, &self.slug),
            FieldChange::if_changed(fields::TASK_PREFIX, &current.task_prefix, &self.task_prefix),
            FieldChange::if_changed(
                fields::ICON_ASSET_ID,
                &current.icon_asset_id,
                &self.icon_asset_id,
            ),
            FieldChange::if_changed(fields::DELETED_AT, &current.deleted_at, &self.deleted_at),
        ]
        .into_iter()
        .flatten()
        .collect()
    }
}

/// Writes `next` over `current`, which the transaction `tx` has locked (`repo::lock_workspace`).
/// Every change of a workspace goes through here — edit, delete, restore — and gets the same:
/// a new `version` and `updated_at`, the old slug kept as an alias, the task prefix history, and
/// each changed field in the history (`field_changes`) under `actor_id`.
///
/// `None` when `next` changes nothing: nothing is written, the version stays.
pub async fn update_workspace(
    tx: &mut PgConnection,
    current: &Workspace,
    next: WorkspaceState,
    actor_id: Uuid,
) -> error_handlers::Result<Option<Workspace>> {
    let diff = next.diff(current);
    if diff.is_empty() {
        return Ok(None);
    }

    let workspace_id = current.id;
    let slug_changed = next.slug != current.slug;
    if slug_changed
        && repo::is_slug_taken(&mut *tx, &next.slug).await?
        && !repo::is_own_slug(&mut *tx, actor_id, workspace_id, &next.slug).await?
    {
        return Err(slug_taken());
    }

    let updated = repo::update_workspace(
        &mut *tx,
        workspace_id,
        WorkspaceFields {
            name: &next.name,
            slug: &next.slug,
            task_prefix: &next.task_prefix,
            icon_asset_id: next.icon_asset_id,
            deleted_at: next.deleted_at,
        },
    )
    .await
    .map_err(|error| match error {
        sqlx::Error::Database(db) if db.constraint() == Some(SLUG_CONSTRAINT) => slug_taken(),
        other => ApiError::from(other),
    })?;

    if slug_changed {
        repo::move_slug(tx, workspace_id, &current.slug, &next.slug).await?;
    }
    if next.task_prefix != current.task_prefix {
        repo::switch_task_prefix(tx, workspace_id, &next.task_prefix).await?;
    }

    changes::repo::record(
        &mut *tx,
        Entity::Workspace,
        workspace_id,
        updated.version,
        actor_id,
        Some(workspace_id),
        &diff,
    )
    .await?;

    Ok(Some(updated))
}

/// `409` with `slug: TAKEN`, like `create`.
pub fn slug_taken() -> ApiError {
    ApiError::new(ErrorCode::Conflict)
        .with_field_errors(vec![FieldError::new(fields::SLUG, ErrorCode::Taken)])
}

#[cfg(test)]
mod tests {
    use serde_json::json;

    use super::*;

    fn workspace() -> Workspace {
        let at = DateTime::from_timestamp(1_790_000_000, 0).unwrap();
        Workspace {
            id: Uuid::nil(),
            name: "Verso team".into(),
            slug: "verso-team".into(),
            task_prefix: "VT".into(),
            icon_asset_id: None,
            access_epoch: 0,
            version: 1,
            created_at: at,
            updated_at: at,
            deleted_at: None,
        }
    }

    #[test]
    fn the_same_state_is_no_change() {
        let current = workspace();

        assert!(WorkspaceState::from(&current).diff(&current).is_empty());
    }

    #[test]
    fn a_delete_is_a_change_of_deleted_at() {
        let current = workspace();
        let at = DateTime::from_timestamp(1_790_000_100, 0).unwrap();
        let next = WorkspaceState {
            deleted_at: Some(at),
            ..WorkspaceState::from(&current)
        };

        assert_eq!(
            next.diff(&current),
            [FieldChange {
                field: "deletedAt",
                old: json!(null),
                new: json!(at),
            }]
        );
    }

    #[test]
    fn every_changed_field_is_named_as_in_the_api() {
        let current = workspace();
        let next = WorkspaceState {
            name: "Verso Labs".into(),
            slug: "verso-labs".into(),
            task_prefix: "VL".into(),
            icon_asset_id: Some(Uuid::from_u128(7)),
            deleted_at: None,
        };

        let fields: Vec<_> = next.diff(&current).iter().map(|c| c.field).collect();
        assert_eq!(fields, ["name", "slug", "taskPrefix", "iconAssetId"]);
    }

    #[test]
    fn a_workspace_can_be_restored_for_30_days() {
        let now = Utc::now();

        assert!(is_restorable(now));
        assert!(is_restorable(now - Duration::days(29)));
        assert!(!is_restorable(
            now - Duration::days(30) - Duration::minutes(1)
        ));
    }
}
