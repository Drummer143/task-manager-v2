use axum::{Extension, Json, extract::State};
use sql_models::workspace::model::Capability;
use sqlx::PgPool;

use crate::{
    shared::extractors::ClientId,
    signals::Signals,
    workspaces::{
        dto::WorkspaceResponse,
        middleware::WorkspaceContext,
        repo,
        service::{self, WorkspaceState},
        updates,
    },
};

/// Brings a deleted workspace back, as it was, for every member. Only its owner, within 30 days
/// of the delete; then it is `404` (the layer, `load_workspace_context_with_deleted`). Restoring
/// a workspace that is not deleted changes nothing.
#[utoipa::path(
    post,
    path = "/workspaces/{workspace_id}/restore",
    operation_id = "restoreWorkspace",
    params(
        ("workspace_id" = Uuid, Path, description = "Target workspace id")
    ),
    responses(
        (status = 200, description = "The workspace as it is now", body = WorkspaceResponse),
        (status = 401, description = "Unauthorized"),
        (status = 403, description = "Not the owner: no `workspace.delete`"),
        (status = 404, description = "Workspace not found, or deleted more than 30 days ago"),
        (status = 500, description = "Internal server error")
    ),
    tag = "Workspaces"
)]
pub async fn restore_workspace(
    State(pool): State<PgPool>,
    State(signals): State<Signals>,
    ClientId(origin): ClientId,
    Extension(workspace_ctx): Extension<WorkspaceContext>,
) -> error_handlers::Result<Json<WorkspaceResponse>> {
    workspace_ctx.authorize(Capability::WorkspaceDelete)?;

    let workspace_id = workspace_ctx.workspace.id;

    let mut tx = pool.begin().await?;
    let current = repo::lock_workspace(&mut *tx, workspace_id).await?;

    let next = WorkspaceState {
        deleted_at: None,
        ..WorkspaceState::from(&current)
    };
    // Not deleted: restored already, the same request again
    let Some(restored) =
        service::update_workspace(&mut tx, &current, next, workspace_ctx.member.user_id).await?
    else {
        return Ok(Json(WorkspaceResponse::from(current)));
    };

    tx.commit().await?;

    updates::publish_changed(
        &pool,
        &signals,
        workspace_id,
        updates::WORKSPACE_RESTORED,
        origin,
    )
    .await;

    Ok(Json(WorkspaceResponse::from(restored)))
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

    async fn delete(pool: &PgPool, owner: Uuid, workspace_id: Uuid) {
        let body = json!({ "confirmName": "Verso team" });
        let (status, _) = send(pool, owner, "DELETE", workspace_id, "", Some(body)).await;
        assert_eq!(status, StatusCode::NO_CONTENT);
    }

    async fn restore(pool: &PgPool, user_id: Uuid, workspace_id: Uuid) -> (StatusCode, Value) {
        send(pool, user_id, "POST", workspace_id, "/restore", None).await
    }

    #[sqlx::test(migrations = "./migrations")]
    #[ignore = "needs DATABASE_URL to a disposable Postgres"]
    async fn the_owner_brings_it_back_for_everyone(pool: PgPool) {
        let owner = user(&pool).await;
        let workspace = workspace_of(&pool, owner, "verso-team").await;
        let member = member_of(&pool, workspace).await;
        delete(&pool, owner, workspace).await;
        let tab = Uuid::now_v7();

        let (status, sent) =
            test_app::send_from(&pool, tab, owner, "POST", workspace, "/restore", None).await;

        assert_eq!(status, StatusCode::OK);
        assert_eq!(
            sorted(sent),
            workspace_changed("workspace.restored", workspace, vec![owner, member], tab)
        );

        let (status, body) = send(&pool, member, "GET", workspace, "", None).await;
        assert_eq!(status, StatusCode::OK);
        assert_eq!(body["version"], json!(3));
        assert_eq!(body["deletedAt"], Value::Null);

        let recorded = history(&pool, workspace).await;
        let fields: Vec<_> = recorded
            .iter()
            .map(|(version, field, _, new)| (*version, field.as_str(), new.is_null()))
            .collect();
        assert_eq!(fields, [(2, "deletedAt", false), (3, "deletedAt", true)]);
    }

    #[sqlx::test(migrations = "./migrations")]
    #[ignore = "needs DATABASE_URL to a disposable Postgres"]
    async fn after_30_days_it_is_gone_even_for_the_owner(pool: PgPool) {
        let owner = user(&pool).await;
        let workspace = workspace_of(&pool, owner, "verso-team").await;
        sqlx::query(
            "UPDATE workspaces SET deleted_at = CURRENT_TIMESTAMP - INTERVAL '31 days'
             WHERE id = $1",
        )
        .bind(workspace)
        .execute(&pool)
        .await
        .unwrap();

        assert_eq!(
            restore(&pool, owner, workspace).await.0,
            StatusCode::NOT_FOUND
        );
        let (status, _) = send(&pool, owner, "GET", workspace, "", None).await;
        assert_eq!(status, StatusCode::NOT_FOUND);
    }

    #[sqlx::test(migrations = "./migrations")]
    #[ignore = "needs DATABASE_URL to a disposable Postgres"]
    async fn restoring_a_live_workspace_changes_nothing(pool: PgPool) {
        let owner = user(&pool).await;
        let workspace = workspace_of(&pool, owner, "verso-team").await;

        let (status, sent) = test_app::send_from(
            &pool,
            Uuid::now_v7(),
            owner,
            "POST",
            workspace,
            "/restore",
            None,
        )
        .await;

        assert_eq!(status, StatusCode::OK);
        assert!(sent.is_empty());
        let (_, body) = restore(&pool, owner, workspace).await;
        assert_eq!(body["version"], json!(1));
        assert!(history(&pool, workspace).await.is_empty());
    }

    #[sqlx::test(migrations = "./migrations")]
    #[ignore = "needs DATABASE_URL to a disposable Postgres"]
    async fn a_member_may_not_restore(pool: PgPool) {
        let owner = user(&pool).await;
        let workspace = workspace_of(&pool, owner, "verso-team").await;
        let member = member_of(&pool, workspace).await;

        // A live one: they see it, and lack the capability
        let (status, body) = restore(&pool, member, workspace).await;
        assert_eq!(status, StatusCode::FORBIDDEN);
        assert_eq!(body["params"]["capability"], json!("workspace.delete"));

        // A deleted one: they do not see it at all
        delete(&pool, owner, workspace).await;
        assert_eq!(
            restore(&pool, member, workspace).await.0,
            StatusCode::NOT_FOUND
        );
    }
}
