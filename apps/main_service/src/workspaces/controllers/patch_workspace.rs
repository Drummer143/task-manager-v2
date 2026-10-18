use axum::{Extension, Json, extract::State};
use chrono::SecondsFormat;
use error_handlers::{ApiError, EditedField, ErrorCode, FieldError, extract::ApiJson};
use serde::Deserialize;
use sql_models::{
    asset::model::{AssetOwnerType, AssetStatus},
    workspace::model::Capability,
};
use sqlx::PgPool;
use utoipa::ToSchema;
use uuid::Uuid;

use crate::{
    assets::repo::AssetsRepository,
    changes::{
        self,
        dto::{Entity, FieldChange, FieldConflict},
    },
    workspaces::{
        dto::{ChangeSet, WorkspaceResponse, fields},
        middleware::WorkspaceContext,
        repo::{self, WorkspaceFields},
        utils::{validate_task_prefix, validate_workspace_name, validate_workspace_slug},
    },
};

/// The `UNIQUE` of `workspaces.slug`: someone took the slug between the check and the write.
const SLUG_CONSTRAINT: &str = "workspaces_slug_key";

#[derive(Deserialize, ToSchema)]
#[serde(rename_all = "camelCase")]
pub struct PatchWorkspaceRequest {
    /// The `version` the edit was made on.
    pub base_version: i64,
    pub set: ChangeSet,
}

// Edits General (access spec §9.1): only the fields sent, each checked for a conflict on its
// own, so concurrent edits of different fields both go through (backend spec §5.3)
#[utoipa::path(
    patch,
    path = "/workspaces/{workspace_id}",
    operation_id = "patchWorkspace",
    params(
        ("workspace_id" = Uuid, Path, description = "Target workspace id")
    ),
    request_body = PatchWorkspaceRequest,
    responses(
        (status = 200, description = "The workspace as it is now", body = WorkspaceResponse),
        (status = 401, description = "Unauthorized"),
        (status = 403, description = "No `workspace.settings`"),
        (status = 404, description = "Workspace not found"),
        (status = 409, description = "`EDIT_CONFLICT`: someone changed these fields since; or the slug is taken"),
        (status = 422, description = "Invalid fields, nothing to set, or a version from the future"),
        (status = 500, description = "Internal server error")
    ),
    tag = "Workspaces"
)]
pub async fn patch_workspace(
    State(pool): State<PgPool>,
    Extension(workspace_ctx): Extension<WorkspaceContext>,
    ApiJson(body): ApiJson<PatchWorkspaceRequest>,
) -> error_handlers::Result<Json<WorkspaceResponse>> {
    workspace_ctx.authorize(Capability::WorkspaceSettings)?;

    let set = trimmed(body.set);
    if is_empty(&set) {
        return Err(ApiError::new(ErrorCode::EmptyRequestBody));
    }
    validate(&set)?;

    let workspace_id = workspace_ctx.workspace.id;
    let user_id = workspace_ctx.member.user_id;

    if let Some(Some(icon_asset_id)) = set.icon_asset_id {
        ensure_icon_of(&pool, icon_asset_id, workspace_id).await?;
    }

    let mut tx = pool.begin().await?;
    let current = repo::lock_workspace(&mut *tx, workspace_id).await?;

    if body.base_version > current.version {
        return Err(ApiError::validation(vec![FieldError::new(
            "baseVersion",
            ErrorCode::InvalidFormat,
        )]));
    }

    let found = changes::repo::conflicts(
        &mut *tx,
        Entity::Workspace,
        workspace_id,
        body.base_version,
        &sent_fields(&set),
    )
    .await?;
    if !found.is_empty() {
        return Err(edit_conflict(found));
    }

    let name = set.name.as_deref().unwrap_or(&current.name);
    let slug = set.slug.as_deref().unwrap_or(&current.slug);
    let task_prefix = set.task_prefix.as_deref().unwrap_or(&current.task_prefix);
    let icon_asset_id = set.icon_asset_id.unwrap_or(current.icon_asset_id);

    let diff: Vec<FieldChange> = [
        FieldChange::if_changed(fields::NAME, &current.name.as_str(), &name),
        FieldChange::if_changed(fields::SLUG, &current.slug.as_str(), &slug),
        FieldChange::if_changed(
            fields::TASK_PREFIX,
            &current.task_prefix.as_str(),
            &task_prefix,
        ),
        FieldChange::if_changed(
            fields::ICON_ASSET_ID,
            &current.icon_asset_id,
            &icon_asset_id,
        ),
    ]
    .into_iter()
    .flatten()
    .collect();

    // Everything sent is as it already is: no new version, nothing to record
    if diff.is_empty() {
        return Ok(Json(WorkspaceResponse::from(current)));
    }

    let slug_changed = slug != current.slug;
    if slug_changed
        && repo::is_slug_taken(&mut *tx, slug).await?
        && !repo::is_own_slug(&mut *tx, user_id, workspace_id, slug).await?
    {
        return Err(slug_taken());
    }

    let updated = repo::update_workspace(
        &mut *tx,
        workspace_id,
        WorkspaceFields {
            name,
            slug,
            task_prefix,
            icon_asset_id,
        },
    )
    .await
    .map_err(|error| match error {
        sqlx::Error::Database(db) if db.constraint() == Some(SLUG_CONSTRAINT) => slug_taken(),
        other => ApiError::from(other),
    })?;

    if slug_changed {
        repo::move_slug(&mut tx, workspace_id, &current.slug, slug).await?;
    }
    if task_prefix != current.task_prefix {
        repo::switch_task_prefix(&mut tx, workspace_id, task_prefix).await?;
    }

    changes::repo::record(
        &mut *tx,
        Entity::Workspace,
        workspace_id,
        updated.version,
        user_id,
        Some(workspace_id),
        &diff,
    )
    .await?;

    tx.commit().await?;

    Ok(Json(WorkspaceResponse::from(updated)))
}

/// Trims the text fields, as `create` does.
fn trimmed(set: ChangeSet) -> ChangeSet {
    ChangeSet {
        name: set.name.map(|v| v.trim().to_owned()),
        slug: set.slug.map(|v| v.trim().to_owned()),
        task_prefix: set.task_prefix.map(|v| v.trim().to_owned()),
        icon_asset_id: set.icon_asset_id,
    }
}

fn is_empty(set: &ChangeSet) -> bool {
    sent_fields(set).is_empty()
}

/// The API's names of the fields the edit sets.
fn sent_fields(set: &ChangeSet) -> Vec<&'static str> {
    [
        (set.name.is_some(), fields::NAME),
        (set.slug.is_some(), fields::SLUG),
        (set.task_prefix.is_some(), fields::TASK_PREFIX),
        (set.icon_asset_id.is_some(), fields::ICON_ASSET_ID),
    ]
    .into_iter()
    .filter_map(|(sent, field)| sent.then_some(field))
    .collect()
}

/// The format of every field sent, all errors at once.
fn validate(set: &ChangeSet) -> error_handlers::Result<()> {
    let errors: Vec<FieldError> = [
        set.name
            .as_deref()
            .and_then(|v| validate_workspace_name(v).err())
            .map(|code| FieldError::new(fields::NAME, code)),
        set.slug
            .as_deref()
            .and_then(|v| validate_workspace_slug(v).err())
            .map(|code| FieldError::new(fields::SLUG, code)),
        set.task_prefix
            .as_deref()
            .and_then(|v| validate_task_prefix(v).err())
            .map(|code| FieldError::new(fields::TASK_PREFIX, code)),
    ]
    .into_iter()
    .flatten()
    .collect();

    if errors.is_empty() {
        Ok(())
    } else {
        Err(ApiError::validation(errors))
    }
}

/// A new icon must be a finished upload made for this workspace's icon.
async fn ensure_icon_of(
    pool: &PgPool,
    asset_id: Uuid,
    workspace_id: Uuid,
) -> error_handlers::Result<()> {
    let asset = AssetsRepository::get(pool, asset_id).await?;
    let fits = asset.is_some_and(|asset| {
        asset.status == AssetStatus::Ready
            && asset.owner_type == AssetOwnerType::WorkspaceIcon
            && asset.owner_id == workspace_id
    });

    if fits {
        Ok(())
    } else {
        Err(ApiError::validation(vec![FieldError::new(
            fields::ICON_ASSET_ID,
            ErrorCode::InvalidFormat,
        )]))
    }
}

/// `409` with `slug: TAKEN`, like `create`.
fn slug_taken() -> ApiError {
    ApiError::new(ErrorCode::Conflict)
        .with_field_errors(vec![FieldError::new(fields::SLUG, ErrorCode::Taken)])
}

fn edit_conflict(found: Vec<FieldConflict>) -> ApiError {
    ApiError::new(ErrorCode::EditConflict {
        conflicts: found
            .into_iter()
            .map(|conflict| EditedField {
                field: conflict.field,
                by: conflict.by.map(|by| by.to_string()),
                at: conflict.at.to_rfc3339_opts(SecondsFormat::Secs, true),
            })
            .collect(),
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    fn set(json: serde_json::Value) -> ChangeSet {
        serde_json::from_value(json).unwrap()
    }

    #[test]
    fn a_null_icon_removes_it_and_a_missing_one_keeps_it() {
        assert_eq!(
            set(serde_json::json!({ "iconAssetId": null })).icon_asset_id,
            Some(None)
        );
        assert_eq!(
            set(serde_json::json!({ "name": "Verso" })).icon_asset_id,
            None
        );
    }

    #[test]
    fn the_sent_fields_are_named_as_in_the_api() {
        let sent = set(serde_json::json!({ "taskPrefix": "VT", "iconAssetId": null }));

        assert_eq!(sent_fields(&sent), ["taskPrefix", "iconAssetId"]);
        assert!(is_empty(&set(serde_json::json!({}))));
    }

    #[test]
    fn every_bad_field_is_reported_at_once() {
        let error = validate(&trimmed(set(serde_json::json!({
            "name": "  ",
            "slug": "Bad Slug",
            "taskPrefix": "toolong",
        }))))
        .unwrap_err();

        let fields: Vec<_> = error
            .to_body()
            .errors
            .into_iter()
            .map(|e| e.field)
            .collect();
        assert_eq!(fields, ["name", "slug", "taskPrefix"]);
    }

    // Needs a disposable Postgres; `#[sqlx::test]` creates a fresh database per test there:
    //   DATABASE_URL=postgres://test:test@127.0.0.1:55432/postgres cargo test -p main_service -- --ignored
    // Never point it at a shared database.
    mod api {
        use axum::{
            Router,
            body::{Body, to_bytes},
            http::{Request, StatusCode},
            middleware::from_fn_with_state,
            routing::{get, patch},
        };
        use serde_json::{Value, json};
        use tower::ServiceExt;

        use super::*;
        use crate::workspaces::{
            controllers::get_workspace_by_id::get_workspace_by_id,
            middleware::{load_workspace_context, load_workspace_context_with_deleted},
        };

        /// Like the real router: `GET /` behind the owner-sees-deleted layer, `PATCH /` behind
        /// the default one, on the same path.
        fn app(pool: &PgPool, user_id: Uuid) -> Router {
            let with_deleted = Router::new()
                .route("/", get(get_workspace_by_id))
                .route_layer(from_fn_with_state(
                    pool.clone(),
                    load_workspace_context_with_deleted,
                ));
            let live = Router::new()
                .route("/", patch(patch_workspace))
                .route_layer(from_fn_with_state(pool.clone(), load_workspace_context));

            Router::new()
                .nest("/workspaces/{workspace_id}", with_deleted.merge(live))
                .with_state(pool.clone())
                .layer(Extension(user_id))
        }

        async fn send(
            pool: &PgPool,
            user_id: Uuid,
            method: &str,
            workspace_id: Uuid,
            body: Option<Value>,
        ) -> (StatusCode, Value) {
            let request = Request::builder()
                .method(method)
                .uri(format!("/workspaces/{workspace_id}"))
                .header("content-type", "application/json");
            let request = match body {
                Some(body) => request.body(Body::from(body.to_string())),
                None => request.body(Body::empty()),
            }
            .unwrap();

            let response = app(pool, user_id).oneshot(request).await.unwrap();
            let status = response.status();
            let bytes = to_bytes(response.into_body(), usize::MAX).await.unwrap();

            (
                status,
                serde_json::from_slice(&bytes).unwrap_or(Value::Null),
            )
        }

        async fn edit(
            pool: &PgPool,
            user_id: Uuid,
            workspace_id: Uuid,
            base_version: i64,
            set: Value,
        ) -> (StatusCode, Value) {
            let body = json!({ "baseVersion": base_version, "set": set });
            send(pool, user_id, "PATCH", workspace_id, Some(body)).await
        }

        async fn user(pool: &PgPool) -> Uuid {
            let id = Uuid::now_v7();
            sqlx::query("INSERT INTO users (id, username) VALUES ($1, 'test')")
                .bind(id)
                .execute(pool)
                .await
                .unwrap();
            id
        }

        async fn workspace_of(pool: &PgPool, owner: Uuid, slug: &str) -> Uuid {
            let id = Uuid::now_v7();
            repo::init_workspace(
                pool,
                repo::CreateWorkspaceRequest {
                    id,
                    name: "Verso team".into(),
                    slug: slug.into(),
                    task_prefix: "VT".into(),
                },
                &owner,
            )
            .await
            .unwrap();
            id
        }

        async fn member_of(pool: &PgPool, workspace_id: Uuid) -> Uuid {
            let member = user(pool).await;
            sqlx::query("INSERT INTO members (workspace_id, user_id) VALUES ($1, $2)")
                .bind(workspace_id)
                .bind(member)
                .execute(pool)
                .await
                .unwrap();
            sqlx::query(
                "INSERT INTO member_roles (workspace_id, user_id, role_id)
                 SELECT $1, $2, id FROM roles WHERE workspace_id = $1 AND builtin = 'member'",
            )
            .bind(workspace_id)
            .bind(member)
            .execute(pool)
            .await
            .unwrap();
            member
        }

        /// A finished upload made for the workspace's icon.
        async fn icon_of(pool: &PgPool, workspace_id: Uuid) -> Uuid {
            let hash = format!("{:064x}", Uuid::now_v7().as_u128());
            let blob: Uuid = sqlx::query_scalar(
                "INSERT INTO blobs (hash, size, path, mime_type)
                 VALUES ($1, 10, '/static/x', 'image/png') RETURNING id",
            )
            .bind(&hash)
            .fetch_one(pool)
            .await
            .unwrap();
            let id = Uuid::now_v7();
            sqlx::query(
                "INSERT INTO assets (id, workspace_id, owner_type, owner_id, name, size, hash,
                                     blob_id, status, visibility)
                 VALUES ($1, $2, 'workspace_icon', $2, 'icon.png', 10, $3, $4, 'ready', 'public')",
            )
            .bind(id)
            .bind(workspace_id)
            .bind(&hash)
            .bind(blob)
            .execute(pool)
            .await
            .unwrap();
            id
        }

        async fn recorded(pool: &PgPool, workspace_id: Uuid) -> Vec<(i64, String, Value, Value)> {
            sqlx::query_as(
                "SELECT version, field, old_value, new_value FROM field_changes
                 WHERE entity_id = $1 ORDER BY version, field",
            )
            .bind(workspace_id)
            .fetch_all(pool)
            .await
            .unwrap()
        }

        #[sqlx::test(migrations = "./migrations")]
        #[ignore = "needs DATABASE_URL to a disposable Postgres"]
        async fn an_edit_applies_bumps_the_version_and_is_recorded(pool: PgPool) {
            let owner = user(&pool).await;
            let workspace = workspace_of(&pool, owner, "verso-team").await;

            let (status, body) = edit(
                &pool,
                owner,
                workspace,
                1,
                json!({ "name": "  Verso Labs " }),
            )
            .await;

            assert_eq!(status, StatusCode::OK, "{body}");
            assert_eq!(body["name"], json!("Verso Labs"));
            assert_eq!(body["version"], json!(2));
            assert_eq!(
                recorded(&pool, workspace).await,
                [(
                    2,
                    "name".to_string(),
                    json!("Verso team"),
                    json!("Verso Labs")
                )]
            );

            // GET on the same path still works next to PATCH
            let (status, body) = send(&pool, owner, "GET", workspace, None).await;
            assert_eq!(status, StatusCode::OK);
            assert_eq!(body["name"], json!("Verso Labs"));
        }

        #[sqlx::test(migrations = "./migrations")]
        #[ignore = "needs DATABASE_URL to a disposable Postgres"]
        async fn a_field_sent_as_it_is_changes_nothing(pool: PgPool) {
            let owner = user(&pool).await;
            let workspace = workspace_of(&pool, owner, "verso-team").await;

            let (status, body) = edit(
                &pool,
                owner,
                workspace,
                1,
                json!({ "name": "Verso team", "slug": "verso-team" }),
            )
            .await;

            assert_eq!(status, StatusCode::OK);
            assert_eq!(body["version"], json!(1));
            assert!(recorded(&pool, workspace).await.is_empty());
        }

        #[sqlx::test(migrations = "./migrations")]
        #[ignore = "needs DATABASE_URL to a disposable Postgres"]
        async fn edits_of_different_fields_both_go_through_the_same_field_conflicts(pool: PgPool) {
            let owner = user(&pool).await;
            let workspace = workspace_of(&pool, owner, "verso-team").await;

            // Two clients edit version 1
            let (first, _) = edit(&pool, owner, workspace, 1, json!({ "name": "A" })).await;
            let (second, body) =
                edit(&pool, owner, workspace, 1, json!({ "taskPrefix": "VL" })).await;
            assert_eq!((first, second), (StatusCode::OK, StatusCode::OK));
            assert_eq!(body["version"], json!(3));

            let (status, body) = edit(&pool, owner, workspace, 1, json!({ "name": "B" })).await;
            assert_eq!(status, StatusCode::CONFLICT);
            assert_eq!(body["code"], json!("EDIT_CONFLICT"));
            let conflicts = &body["params"]["conflicts"];
            assert_eq!(conflicts[0]["field"], json!("name"));
            assert_eq!(conflicts[0]["by"], json!(owner.to_string()));

            // Nothing of the refused edit was applied
            let (_, now) = send(&pool, owner, "GET", workspace, None).await;
            assert_eq!(now["name"], json!("A"));
        }

        #[sqlx::test(migrations = "./migrations")]
        #[ignore = "needs DATABASE_URL to a disposable Postgres"]
        async fn refuses_a_member_without_the_capability(pool: PgPool) {
            let owner = user(&pool).await;
            let workspace = workspace_of(&pool, owner, "verso-team").await;
            let member = member_of(&pool, workspace).await;

            let (status, body) = edit(&pool, member, workspace, 1, json!({ "name": "X" })).await;

            assert_eq!(status, StatusCode::FORBIDDEN);
            assert_eq!(body["code"], json!("ACCESS_DENIED"));
            assert_eq!(body["params"]["capability"], json!("workspace.settings"));
        }

        #[sqlx::test(migrations = "./migrations")]
        #[ignore = "needs DATABASE_URL to a disposable Postgres"]
        async fn refuses_an_empty_edit_bad_fields_and_a_version_from_the_future(pool: PgPool) {
            let owner = user(&pool).await;
            let workspace = workspace_of(&pool, owner, "verso-team").await;

            let (status, body) = edit(&pool, owner, workspace, 1, json!({})).await;
            assert_eq!(status, StatusCode::UNPROCESSABLE_ENTITY);
            assert_eq!(body["code"], json!("EMPTY_REQUEST_BODY"));

            let (status, body) = edit(
                &pool,
                owner,
                workspace,
                1,
                json!({ "slug": "-bad", "name": "" }),
            )
            .await;
            assert_eq!(status, StatusCode::UNPROCESSABLE_ENTITY);
            assert_eq!(body["errors"].as_array().unwrap().len(), 2);

            let (status, body) = edit(&pool, owner, workspace, 9, json!({ "name": "X" })).await;
            assert_eq!(status, StatusCode::UNPROCESSABLE_ENTITY);
            assert_eq!(body["errors"][0]["field"], json!("baseVersion"));
        }

        #[sqlx::test(migrations = "./migrations")]
        #[ignore = "needs DATABASE_URL to a disposable Postgres"]
        async fn a_new_slug_keeps_the_old_one_as_an_alias_that_can_be_taken_back(pool: PgPool) {
            let owner = user(&pool).await;
            let workspace = workspace_of(&pool, owner, "verso-team").await;
            workspace_of(&pool, owner, "taken").await;

            let (status, _) =
                edit(&pool, owner, workspace, 1, json!({ "slug": "verso-labs" })).await;
            assert_eq!(status, StatusCode::OK);
            let resolved = repo::get_workspace_by_slug(&pool, owner, "verso-team")
                .await
                .unwrap();
            assert_eq!(resolved.slug, "verso-labs");

            // Its own old slug is not taken for it
            let (status, body) =
                edit(&pool, owner, workspace, 2, json!({ "slug": "verso-team" })).await;
            assert_eq!(status, StatusCode::OK, "{body}");
            let aliases: Vec<String> = sqlx::query_scalar(
                "SELECT slug FROM workspace_slug_aliases WHERE workspace_id = $1",
            )
            .bind(workspace)
            .fetch_all(&pool)
            .await
            .unwrap();
            assert_eq!(aliases, ["verso-labs"]);

            // Another workspace's slug is
            let (status, body) = edit(&pool, owner, workspace, 3, json!({ "slug": "taken" })).await;
            assert_eq!(status, StatusCode::CONFLICT);
            assert_eq!(body["errors"][0]["code"], json!("TAKEN"));
        }

        #[sqlx::test(migrations = "./migrations")]
        #[ignore = "needs DATABASE_URL to a disposable Postgres"]
        async fn a_new_task_prefix_keeps_the_history_and_reopens_an_old_one(pool: PgPool) {
            let owner = user(&pool).await;
            let workspace = workspace_of(&pool, owner, "verso-team").await;

            edit(&pool, owner, workspace, 1, json!({ "taskPrefix": "VL" })).await;
            edit(&pool, owner, workspace, 2, json!({ "taskPrefix": "VT" })).await;

            let prefixes: Vec<(String, bool)> = sqlx::query_as(
                "SELECT prefix, used_until IS NULL FROM workspace_prefixes
                 WHERE workspace_id = $1 ORDER BY prefix",
            )
            .bind(workspace)
            .fetch_all(&pool)
            .await
            .unwrap();
            assert_eq!(
                prefixes,
                [("VL".to_string(), false), ("VT".to_string(), true)]
            );
        }

        #[sqlx::test(migrations = "./migrations")]
        #[ignore = "needs DATABASE_URL to a disposable Postgres"]
        async fn an_icon_must_be_this_workspaces_finished_upload_and_null_removes_it(pool: PgPool) {
            let owner = user(&pool).await;
            let workspace = workspace_of(&pool, owner, "verso-team").await;
            let other = workspace_of(&pool, owner, "other").await;
            let icon = icon_of(&pool, workspace).await;
            let foreign = icon_of(&pool, other).await;

            let (status, body) =
                edit(&pool, owner, workspace, 1, json!({ "iconAssetId": icon })).await;
            assert_eq!(status, StatusCode::OK);
            assert_eq!(body["iconAssetId"], json!(icon.to_string()));

            let (status, body) = edit(
                &pool,
                owner,
                workspace,
                2,
                json!({ "iconAssetId": foreign }),
            )
            .await;
            assert_eq!(status, StatusCode::UNPROCESSABLE_ENTITY);
            assert_eq!(body["errors"][0]["field"], json!("iconAssetId"));

            let (status, body) =
                edit(&pool, owner, workspace, 2, json!({ "iconAssetId": null })).await;
            assert_eq!(status, StatusCode::OK);
            assert_eq!(body["iconAssetId"], Value::Null);
        }

        #[sqlx::test(migrations = "./migrations")]
        #[ignore = "needs DATABASE_URL to a disposable Postgres"]
        async fn a_deleted_workspace_is_not_edited_even_by_its_owner(pool: PgPool) {
            let owner = user(&pool).await;
            let workspace = workspace_of(&pool, owner, "verso-team").await;
            sqlx::query("UPDATE workspaces SET deleted_at = CURRENT_TIMESTAMP WHERE id = $1")
                .bind(workspace)
                .execute(&pool)
                .await
                .unwrap();

            let (status, _) = edit(&pool, owner, workspace, 1, json!({ "name": "X" })).await;

            assert_eq!(status, StatusCode::NOT_FOUND);
        }
    }
}
