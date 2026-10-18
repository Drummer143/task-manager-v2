use axum::{Extension, Json, extract::State};
use error_handlers::{ApiError, ErrorCode};
use serde::Serialize;
use sqlx::PgPool;
use utoipa::ToSchema;

use crate::workspaces::{self, middleware::WorkspaceContext};

/// What the workspace holds, for the texts of the Delete and Transfer dialogs: "This will delete
/// 64 pages and 1,284 tasks for all 12 members".
#[derive(Serialize, ToSchema)]
pub struct StatsResponse {
    /// Active members, the owner among them.
    pub members: i64,
    pub pages: i64,
    pub tasks: i64,
}

// TODO: Implement pages and tasks counting
#[utoipa::path(
    get,
    path = "/workspaces/{workspace_id}/stats",
    operation_id = "getWorkspaceStats",
    params(
        ("workspace_id" = Uuid, Path, description = "Target workspace id"),
    ),
    responses(
        (status = 200, description = "Workspace stats", body = StatsResponse),
        (status = 401, description = "Unauthorized"),
        (status = 403, description = "A guest: only the owner and members with a role see them"),
        (status = 404, description = "Workspace not found"),
        (status = 500, description = "Internal server error"),
    ),
    tag = "Workspaces"
)]
pub async fn get_stats(
    State(pool): State<PgPool>,
    Extension(ctx): Extension<WorkspaceContext>,
) -> error_handlers::Result<Json<StatsResponse>> {
    if ctx.is_guest() {
        return Err(ApiError::new(ErrorCode::Forbidden));
    }

    let members =
        workspaces::repo::count_active_members_in_workspace(&pool, ctx.workspace.id).await?;

    Ok(Json(StatsResponse {
        members,
        pages: 0,
        tasks: 0,
    }))
}

// Needs a disposable Postgres; `#[sqlx::test]` creates a fresh database per test there:
//   DATABASE_URL=postgres://test:test@127.0.0.1:55432/postgres cargo test -p main_service -- --ignored
// Never point it at a shared database.
#[cfg(test)]
mod api {
    use axum::http::StatusCode;
    use serde_json::json;

    use super::*;
    use crate::workspaces::test_app::{guest_of, member_of, send, user, workspace_of};

    #[sqlx::test(migrations = "./migrations")]
    #[ignore = "needs DATABASE_URL to a disposable Postgres"]
    async fn counts_the_active_members_for_the_owner_and_members_with_a_role(pool: PgPool) {
        let owner = user(&pool).await;
        let workspace = workspace_of(&pool, owner, "verso-team").await;
        let member = member_of(&pool, workspace).await;
        guest_of(&pool, workspace).await;
        let deactivated = member_of(&pool, workspace).await;
        sqlx::query(
            "UPDATE members SET deactivated_at = CURRENT_TIMESTAMP
             WHERE workspace_id = $1 AND user_id = $2",
        )
        .bind(workspace)
        .bind(deactivated)
        .execute(&pool)
        .await
        .unwrap();
        // Another workspace's members are not counted
        member_of(&pool, workspace_of(&pool, owner, "other").await).await;

        for user_id in [owner, member] {
            let (status, body) = send(&pool, user_id, "GET", workspace, "/stats", None).await;
            assert_eq!(status, StatusCode::OK);
            assert_eq!(body, json!({ "members": 3, "pages": 0, "tasks": 0 }));
        }
    }

    #[sqlx::test(migrations = "./migrations")]
    #[ignore = "needs DATABASE_URL to a disposable Postgres"]
    async fn a_guest_may_not_see_them(pool: PgPool) {
        let owner = user(&pool).await;
        let workspace = workspace_of(&pool, owner, "verso-team").await;
        let guest = guest_of(&pool, workspace).await;

        let (status, body) = send(&pool, guest, "GET", workspace, "/stats", None).await;

        assert_eq!(status, StatusCode::FORBIDDEN);
        assert_eq!(body["code"], json!("FORBIDDEN"));
    }

    #[sqlx::test(migrations = "./migrations")]
    #[ignore = "needs DATABASE_URL to a disposable Postgres"]
    async fn a_deleted_workspace_has_none_even_for_its_owner(pool: PgPool) {
        let owner = user(&pool).await;
        let workspace = workspace_of(&pool, owner, "verso-team").await;
        sqlx::query("UPDATE workspaces SET deleted_at = CURRENT_TIMESTAMP WHERE id = $1")
            .bind(workspace)
            .execute(&pool)
            .await
            .unwrap();

        let (status, _) = send(&pool, owner, "GET", workspace, "/stats", None).await;

        assert_eq!(status, StatusCode::NOT_FOUND);
    }
}
