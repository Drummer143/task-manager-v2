use axum::{Extension, extract::State, http::StatusCode};
use chrono::Utc;
use error_handlers::{ApiError, ErrorCode, FieldError, extract::ApiJson};
use serde::Deserialize;
use sql_models::workspace::model::Capability;
use sqlx::PgPool;
use utoipa::ToSchema;

use crate::{
    shared::extractors::ClientId,
    signals::Signals,
    workspaces::{
        middleware::WorkspaceContext,
        repo,
        service::{self, WorkspaceState},
        updates,
    },
};

#[derive(Deserialize, ToSchema)]
#[serde(rename_all = "camelCase")]
pub struct DeleteWorkspaceRequest {
    /// The workspace's name, typed by the owner to confirm. Case and the spaces around do not
    /// matter.
    pub confirm_name: String,
}

/// Deletes the workspace: everyone but the owner loses it at once; the owner can restore it for
/// 30 days, and its slug stays taken meanwhile. Deleting it again changes nothing.
#[utoipa::path(
    delete,
    path = "/workspaces/{workspace_id}",
    operation_id = "deleteWorkspace",
    params(
        ("workspace_id" = Uuid, Path, description = "Target workspace id")
    ),
    request_body = DeleteWorkspaceRequest,
    responses(
        (status = 204, description = "Deleted, now or before"),
        (status = 401, description = "Unauthorized"),
        (status = 403, description = "Not the owner: no `workspace.delete`"),
        (status = 404, description = "Workspace not found"),
        (status = 422, description = "`confirmName` is not the workspace's name"),
        (status = 500, description = "Internal server error")
    ),
    tag = "Workspaces"
)]
pub async fn soft_delete_workspace(
    State(pool): State<PgPool>,
    State(signals): State<Signals>,
    ClientId(origin): ClientId,
    Extension(workspace_ctx): Extension<WorkspaceContext>,
    ApiJson(body): ApiJson<DeleteWorkspaceRequest>,
) -> error_handlers::Result<StatusCode> {
    workspace_ctx.authorize(Capability::WorkspaceDelete)?;

    let workspace_id = workspace_ctx.workspace.id;

    let mut tx = pool.begin().await?;
    let current = repo::lock_workspace(&mut *tx, workspace_id).await?;

    if !is_confirmed(&body.confirm_name, &current.name) {
        return Err(ApiError::validation(vec![FieldError::new(
            "confirmName",
            ErrorCode::Mismatch,
        )]));
    }

    // Deleted already: the same request again
    if current.deleted_at.is_some() {
        return Ok(StatusCode::NO_CONTENT);
    }

    let next = WorkspaceState {
        deleted_at: Some(Utc::now()),
        ..WorkspaceState::from(&current)
    };
    service::update_workspace(&mut tx, &current, next, workspace_ctx.member.user_id).await?;

    tx.commit().await?;

    updates::publish_changed(
        &pool,
        &signals,
        workspace_id,
        updates::WORKSPACE_DELETED,
        origin,
    )
    .await;

    Ok(StatusCode::NO_CONTENT)
}

/// Whether `typed` is the name `name`, but for case and the spaces around.
fn is_confirmed(typed: &str, name: &str) -> bool {
    typed.trim().to_lowercase() == name.trim().to_lowercase()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn the_name_is_confirmed_regardless_of_case_and_the_spaces_around() {
        assert!(is_confirmed("  verso TEAM ", "Verso team"));
        assert!(is_confirmed("Ärger", "äRGER"));
        assert!(!is_confirmed("Verso", "Verso team"));
        assert!(!is_confirmed("verso  team", "Verso team"));
        assert!(!is_confirmed("", "Verso team"));
    }
}

// Needs a disposable Postgres; `#[sqlx::test]` creates a fresh database per test there:
//   DATABASE_URL=postgres://test:test@127.0.0.1:55432/postgres cargo test -p main_service -- --ignored
// Never point it at a shared database.
#[cfg(test)]
mod api {
    use axum::http::StatusCode;
    use serde_json::{Value, json};
    use uuid::Uuid;

    use super::*;
    use crate::workspaces::test_app::{
        self, history, member_of, send, sorted, user, workspace_changed, workspace_of,
    };

    async fn delete(pool: &PgPool, user_id: Uuid, workspace_id: Uuid, name: &str) -> StatusCode {
        let body = json!({ "confirmName": name });
        send(pool, user_id, "DELETE", workspace_id, "", Some(body))
            .await
            .0
    }

    async fn get(pool: &PgPool, user_id: Uuid, workspace_id: Uuid) -> (StatusCode, Value) {
        send(pool, user_id, "GET", workspace_id, "", None).await
    }

    #[sqlx::test(migrations = "./migrations")]
    #[ignore = "needs DATABASE_URL to a disposable Postgres"]
    async fn the_owner_deletes_it_and_only_they_still_see_it(pool: PgPool) {
        let owner = user(&pool).await;
        let workspace = workspace_of(&pool, owner, "verso-team").await;
        let member = member_of(&pool, workspace).await;
        let tab = Uuid::now_v7();

        let body = json!({ "confirmName": "  verso TEAM " });
        let (status, sent) =
            test_app::send_from(&pool, tab, owner, "DELETE", workspace, "", Some(body)).await;

        assert_eq!(status, StatusCode::NO_CONTENT);
        assert_eq!(
            sorted(sent),
            workspace_changed("workspace.deleted", workspace, vec![owner, member], tab)
        );

        let (status, body) = get(&pool, owner, workspace).await;
        assert_eq!(status, StatusCode::OK);
        assert_eq!(body["version"], json!(2));
        assert!(body["deletedAt"].is_string());
        assert_eq!(get(&pool, member, workspace).await.0, StatusCode::NOT_FOUND);

        let recorded = history(&pool, workspace).await;
        assert_eq!(recorded.len(), 1);
        let (version, field, old, new) = &recorded[0];
        assert_eq!(
            (*version, field.as_str(), old),
            (2, "deletedAt", &Value::Null)
        );
        assert!(new.is_string());

        // The slug stays taken while it can be restored
        assert!(repo::is_slug_taken(&pool, "verso-team").await.unwrap());
    }

    #[sqlx::test(migrations = "./migrations")]
    #[ignore = "needs DATABASE_URL to a disposable Postgres"]
    async fn another_name_deletes_nothing(pool: PgPool) {
        let owner = user(&pool).await;
        let workspace = workspace_of(&pool, owner, "verso-team").await;

        let body = json!({ "confirmName": "Verso" });
        let (status, body) = send(&pool, owner, "DELETE", workspace, "", Some(body)).await;

        assert_eq!(status, StatusCode::UNPROCESSABLE_ENTITY);
        assert_eq!(body["errors"][0]["field"], json!("confirmName"));
        assert_eq!(body["errors"][0]["code"], json!("MISMATCH"));
        let (_, now) = get(&pool, owner, workspace).await;
        assert_eq!(now["version"], json!(1));
        assert_eq!(now["deletedAt"], Value::Null);
    }

    #[sqlx::test(migrations = "./migrations")]
    #[ignore = "needs DATABASE_URL to a disposable Postgres"]
    async fn only_the_owner_deletes_and_a_stranger_does_not_find_it(pool: PgPool) {
        let owner = user(&pool).await;
        let workspace = workspace_of(&pool, owner, "verso-team").await;
        let member = member_of(&pool, workspace).await;
        // Admin has every grantable capability, and still not this one
        sqlx::query(
            "INSERT INTO member_roles (workspace_id, user_id, role_id)
             SELECT $1, $2, id FROM roles WHERE workspace_id = $1 AND builtin = 'admin'",
        )
        .bind(workspace)
        .bind(member)
        .execute(&pool)
        .await
        .unwrap();

        let body = json!({ "confirmName": "Verso team" });
        let (status, body) = send(&pool, member, "DELETE", workspace, "", Some(body)).await;
        assert_eq!(status, StatusCode::FORBIDDEN);
        assert_eq!(body["params"]["capability"], json!("workspace.delete"));

        let stranger = user(&pool).await;
        assert_eq!(
            delete(&pool, stranger, workspace, "Verso team").await,
            StatusCode::NOT_FOUND
        );
        assert_eq!(
            get(&pool, owner, workspace).await.1["deletedAt"],
            Value::Null
        );
    }

    #[sqlx::test(migrations = "./migrations")]
    #[ignore = "needs DATABASE_URL to a disposable Postgres"]
    async fn deleting_it_again_changes_nothing(pool: PgPool) {
        let owner = user(&pool).await;
        let workspace = workspace_of(&pool, owner, "verso-team").await;
        delete(&pool, owner, workspace, "Verso team").await;
        let (_, before) = get(&pool, owner, workspace).await;

        let body = json!({ "confirmName": "Verso team" });
        let (status, sent) = test_app::send_from(
            &pool,
            Uuid::now_v7(),
            owner,
            "DELETE",
            workspace,
            "",
            Some(body),
        )
        .await;

        assert_eq!(status, StatusCode::NO_CONTENT);
        assert!(sent.is_empty());
        assert_eq!(get(&pool, owner, workspace).await.1, before);
        assert_eq!(history(&pool, workspace).await.len(), 1);
    }
}
