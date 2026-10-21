use chrono::{DateTime, Duration, Utc};
use error_handlers::{ApiError, ErrorCode, FieldError};
use serde::Deserialize;
use sql_models::workspace::model::{Capability, Workspace};
use sqlx::{PgConnection, PgPool, Postgres};
use utoipa::ToSchema;
use uuid::Uuid;

use crate::{
    changes::{
        self,
        dto::{Entity, FieldChange},
    },
    workspaces::{
        dto::fields,
        middleware::load_context,
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

// ACCESS

/// Fails unless `user_id` may see `workspace_id`: an active member of it, in any role, while it is
/// not deleted. A workspace they are not in is a 404, not a 403, so its id reveals nothing.
///
/// Losing access does not delete notifications, they are just not served while access is gone
/// (backend spec, notifications §8.2): every read of a workspace's notifications goes through here.
pub async fn ensure_member(
    pool: &PgPool,
    user_id: Uuid,
    workspace_id: Uuid,
) -> Result<(), ApiError> {
    if repo::is_active_member(pool, user_id, workspace_id).await? {
        Ok(())
    } else {
        Err(ApiError::new(ErrorCode::NotFound))
    }
}

/// The workspaces `user_id` is in now (active, not deleted), for counts across workspaces.
pub async fn member_workspace_ids(pool: &PgPool, user_id: Uuid) -> Result<Vec<Uuid>, sqlx::Error> {
    repo::get_user_workspace_ids(pool, user_id).await
}

/// Fails unless `user_id` may change `workspace_id`'s settings: its name, icon, address
/// (`workspace.settings`, access spec §2.3). The same context as the routes of a workspace get
/// (`load_context`): `404` when they cannot see it, `403` without the capability.
pub async fn ensure_can_change_settings(
    pool: &PgPool,
    user_id: Uuid,
    workspace_id: Uuid,
) -> Result<(), ApiError> {
    load_context(pool, user_id, workspace_id, false)
        .await?
        .authorize(Capability::WorkspaceSettings)
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

// Needs a disposable Postgres; `#[sqlx::test]` creates a fresh database per test there:
//   DATABASE_URL=postgres://test:test@127.0.0.1:55432/postgres cargo test -p main_service -- --ignored
// Never point it at a shared database.
#[cfg(test)]
mod access {
    use super::*;
    use crate::workspaces::test_app::{guest_of, member_of, user, workspace_of};

    #[sqlx::test(migrations = "./migrations")]
    #[ignore = "needs DATABASE_URL to a disposable Postgres"]
    async fn a_member_sees_the_workspace_anyone_else_gets_a_404(pool: PgPool) {
        let owner = user(&pool).await;
        let workspace = workspace_of(&pool, owner, "verso-team").await;
        // A guest is a member too: no role is needed to see it
        let guest = guest_of(&pool, workspace).await;
        let stranger = user(&pool).await;

        for member in [owner, guest] {
            ensure_member(&pool, member, workspace).await.unwrap();
        }
        let refused = ensure_member(&pool, stranger, workspace).await.unwrap_err();
        assert_eq!(refused.status(), 404);
    }

    #[sqlx::test(migrations = "./migrations")]
    #[ignore = "needs DATABASE_URL to a disposable Postgres"]
    async fn the_counts_go_over_the_users_workspaces_only(pool: PgPool) {
        let me = user(&pool).await;
        let mine = workspace_of(&pool, me, "mine").await;
        let other = workspace_of(&pool, user(&pool).await, "other").await;
        let joined = guest_of(&pool, other).await;

        assert_eq!(member_workspace_ids(&pool, me).await.unwrap(), [mine]);
        assert_eq!(member_workspace_ids(&pool, joined).await.unwrap(), [other]);
        assert!(
            member_workspace_ids(&pool, user(&pool).await)
                .await
                .unwrap()
                .is_empty()
        );
    }

    #[sqlx::test(migrations = "./migrations")]
    #[ignore = "needs DATABASE_URL to a disposable Postgres"]
    async fn the_settings_are_for_the_owner_and_admins(pool: PgPool) {
        let owner = user(&pool).await;
        let workspace = workspace_of(&pool, owner, "verso-team").await;
        let admin = guest_of(&pool, workspace).await;
        sqlx::query(
            "INSERT INTO member_roles (workspace_id, user_id, role_id)
             SELECT $1, $2, id FROM roles WHERE workspace_id = $1 AND builtin = 'admin'",
        )
        .bind(workspace)
        .bind(admin)
        .execute(&pool)
        .await
        .unwrap();
        let member = member_of(&pool, workspace).await;
        let guest = guest_of(&pool, workspace).await;

        for allowed in [owner, admin] {
            ensure_can_change_settings(&pool, allowed, workspace)
                .await
                .unwrap();
        }
        // The built-in Member role has no `workspace.settings`
        for refused in [member, guest] {
            let error = ensure_can_change_settings(&pool, refused, workspace)
                .await
                .unwrap_err();
            assert_eq!(error.status(), 403);
        }
        let stranger = ensure_can_change_settings(&pool, user(&pool).await, workspace)
            .await
            .unwrap_err();
        assert_eq!(stranger.status(), 404);
    }

    #[sqlx::test(migrations = "./migrations")]
    #[ignore = "needs DATABASE_URL to a disposable Postgres"]
    async fn a_deleted_workspace_is_seen_and_changed_by_no_one(pool: PgPool) {
        let owner = user(&pool).await;
        let workspace = workspace_of(&pool, owner, "verso-team").await;
        sqlx::query("UPDATE workspaces SET deleted_at = CURRENT_TIMESTAMP WHERE id = $1")
            .bind(workspace)
            .execute(&pool)
            .await
            .unwrap();

        assert_eq!(
            ensure_member(&pool, owner, workspace)
                .await
                .unwrap_err()
                .status(),
            404
        );
        assert_eq!(
            ensure_can_change_settings(&pool, owner, workspace)
                .await
                .unwrap_err()
                .status(),
            404
        );
        assert!(member_workspace_ids(&pool, owner).await.unwrap().is_empty());
    }
}
