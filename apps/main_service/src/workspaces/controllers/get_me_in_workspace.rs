use std::collections::HashSet;

use axum::{Extension, Json, extract::State};
use serde::Serialize;
use sql_models::workspace::model::Capability;
use sqlx::PgPool;
use utoipa::ToSchema;
use uuid::Uuid;

use crate::workspaces::{
    dto::{CapabilitiesResponse, RoleShortResponse},
    middleware::WorkspaceContext,
    repo,
};

#[derive(Serialize, ToSchema)]
#[serde(rename_all = "camelCase")]
pub struct GetMeInWorkspaceResponse {
    is_owner: bool,
    /// The member's roles, in their order; empty for a guest.
    roles: Vec<RoleShortResponse>,
    capabilities: CapabilitiesResponse,
}

// What the member may do in the workspace (access spec §7): the frontend hides or disables by
// these, never by role names
#[utoipa::path(
    get,
    path = "/workspaces/{workspace_id}/me",
    operation_id = "getMeInWorkspace",
    params(
        ("workspace_id" = Uuid, Path, description = "Target workspace id")
    ),
    responses(
        (status = 200, description = "The member's roles and capabilities", body = GetMeInWorkspaceResponse),
        (status = 401, description = "Unauthorized"),
        (status = 404, description = "Workspace not found"),
        (status = 500, description = "Internal server error")
    ),
    tag = "Workspaces"
)]
pub async fn get_me_in_workspace(
    State(pool): State<PgPool>,
    Extension(workspace_ctx): Extension<WorkspaceContext>,
) -> error_handlers::Result<Json<GetMeInWorkspaceResponse>> {
    let my_role_ids: Vec<Uuid> = workspace_ctx.roles.iter().map(|r| r.id).collect();

    let (all_roles, managed) = tokio::try_join!(
        repo::get_workspace_roles(&pool, workspace_ctx.workspace.id),
        repo::get_roles_managed_by(&pool, &my_role_ids)
    )?;
    let managed: HashSet<Uuid> = managed.into_iter().collect();

    let capabilities = CapabilitiesResponse {
        billing_manage: workspace_ctx.can(Capability::BillingManage),
        labels_create: workspace_ctx.can(Capability::LabelsCreate),
        labels_manage: workspace_ctx.can(Capability::LabelsManage),
        members_invite: workspace_ctx.can(Capability::MembersInvite),
        members_remove: workspace_ctx.can(Capability::MembersRemove),
        members_view: workspace_ctx.can(Capability::MembersView),
        pages_create_root: workspace_ctx.can(Capability::PagesCreateRoot),
        roles_manage: workspace_ctx.can(Capability::RolesManage),
        workspace_delete: workspace_ctx.can(Capability::WorkspaceDelete),
        workspace_export: workspace_ctx.can(Capability::WorkspaceExport),
        workspace_settings: workspace_ctx.can(Capability::WorkspaceSettings),
        workspace_transfer: workspace_ctx.can(Capability::WorkspaceTransfer),

        roles_assign: all_roles
            .iter()
            .filter(|role| workspace_ctx.can_assign(role, &managed))
            .map(|role| role.id)
            .collect(),
    };

    Ok(Json(GetMeInWorkspaceResponse {
        is_owner: workspace_ctx.member.is_owner,
        roles: workspace_ctx
            .roles
            .iter()
            .cloned()
            .map(RoleShortResponse::from)
            .collect(),
        capabilities,
    }))
}

// Needs a disposable Postgres; `#[sqlx::test]` creates a fresh database per test there:
//   DATABASE_URL=postgres://test:test@127.0.0.1:55432/postgres cargo test -p main_service -- --ignored
// Never point it at a shared database.
#[cfg(test)]
mod tests {
    use axum::{
        Router,
        body::{Body, to_bytes},
        http::{Request, StatusCode},
        middleware::from_fn_with_state,
        routing::get,
    };
    use serde_json::{Value, json};
    use tower::ServiceExt;

    use super::*;
    use crate::workspaces::middleware::load_workspace_context;

    async fn me(pool: &PgPool, user_id: Uuid, workspace_id: Uuid) -> (StatusCode, Value) {
        let app = Router::new()
            .route("/workspaces/{workspace_id}/me", get(get_me_in_workspace))
            .route_layer(from_fn_with_state(pool.clone(), load_workspace_context))
            .with_state(pool.clone())
            .layer(Extension(user_id));
        let response = app
            .oneshot(
                Request::get(format!("/workspaces/{workspace_id}/me"))
                    .body(Body::empty())
                    .unwrap(),
            )
            .await
            .unwrap();
        let status = response.status();
        let body = to_bytes(response.into_body(), usize::MAX).await.unwrap();

        (status, serde_json::from_slice(&body).unwrap_or(Value::Null))
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

    async fn workspace_of(pool: &PgPool, owner: Uuid) -> Uuid {
        let id = Uuid::now_v7();
        repo::init_workspace(
            pool,
            repo::CreateWorkspaceRequest {
                id,
                name: "Verso team".into(),
                slug: format!("ws-{}", id.simple()),
                task_prefix: "VT".into(),
            },
            &owner,
        )
        .await
        .unwrap();
        id
    }

    /// The id of a built-in or custom role by its slug.
    async fn role_id(pool: &PgPool, workspace_id: Uuid, slug: &str) -> Uuid {
        sqlx::query_scalar("SELECT id FROM roles WHERE workspace_id = $1 AND slug = $2")
            .bind(workspace_id)
            .bind(slug)
            .fetch_one(pool)
            .await
            .unwrap()
    }

    async fn custom_role(
        pool: &PgPool,
        workspace_id: Uuid,
        slug: &str,
        capabilities: &[Capability],
    ) -> Uuid {
        sqlx::query_scalar(
            "INSERT INTO roles (workspace_id, name, slug, color, position, capabilities)
             VALUES ($1, $2, $2, 3, 5, $3) RETURNING id",
        )
        .bind(workspace_id)
        .bind(slug)
        .bind(capabilities)
        .fetch_one(pool)
        .await
        .unwrap()
    }

    async fn join(pool: &PgPool, workspace_id: Uuid, user_id: Uuid, role_ids: &[Uuid]) {
        sqlx::query("INSERT INTO members (workspace_id, user_id) VALUES ($1, $2)")
            .bind(workspace_id)
            .bind(user_id)
            .execute(pool)
            .await
            .unwrap();
        for role_id in role_ids {
            sqlx::query(
                "INSERT INTO member_roles (workspace_id, user_id, role_id) VALUES ($1, $2, $3)",
            )
            .bind(workspace_id)
            .bind(user_id)
            .bind(role_id)
            .execute(pool)
            .await
            .unwrap();
        }
    }

    async fn manages(pool: &PgPool, workspace_id: Uuid, manager: Uuid, role: Uuid) {
        sqlx::query(
            "INSERT INTO role_managers (workspace_id, role_id, manager_role_id) VALUES ($1, $2, $3)",
        )
        .bind(workspace_id)
        .bind(role)
        .bind(manager)
        .execute(pool)
        .await
        .unwrap();
    }

    fn assignable(body: &Value) -> Vec<String> {
        let mut ids: Vec<String> = body["capabilities"]["roles.assign"]
            .as_array()
            .unwrap()
            .iter()
            .map(|id| id.as_str().unwrap().to_owned())
            .collect();
        ids.sort();
        ids
    }

    fn sorted(ids: &[Uuid]) -> Vec<String> {
        let mut ids: Vec<String> = ids.iter().map(Uuid::to_string).collect();
        ids.sort();
        ids
    }

    #[sqlx::test(migrations = "./migrations")]
    #[ignore = "needs DATABASE_URL to a disposable Postgres"]
    async fn the_owner_may_do_everything_and_give_every_role(pool: PgPool) {
        let owner = user(&pool).await;
        let workspace = workspace_of(&pool, owner).await;
        let admin = role_id(&pool, workspace, "admin").await;
        let member = role_id(&pool, workspace, "member").await;

        let (status, body) = me(&pool, owner, workspace).await;

        assert_eq!(status, StatusCode::OK);
        assert_eq!(body["isOwner"], json!(true));
        assert_eq!(body["roles"][0]["slug"], json!("admin"));
        assert_eq!(body["capabilities"]["workspace.delete"], json!(true));
        assert_eq!(body["capabilities"]["workspace.settings"], json!(true));
        assert_eq!(assignable(&body), sorted(&[admin, member]));
    }

    #[sqlx::test(migrations = "./migrations")]
    #[ignore = "needs DATABASE_URL to a disposable Postgres"]
    async fn a_member_has_the_member_roles_capabilities_and_gives_nothing(pool: PgPool) {
        let owner = user(&pool).await;
        let workspace = workspace_of(&pool, owner).await;
        let member_role = role_id(&pool, workspace, "member").await;
        let member = user(&pool).await;
        join(&pool, workspace, member, &[member_role]).await;

        let (status, body) = me(&pool, member, workspace).await;

        assert_eq!(status, StatusCode::OK);
        assert_eq!(body["isOwner"], json!(false));
        let capabilities = &body["capabilities"];
        assert_eq!(capabilities["members.view"], json!(true));
        assert_eq!(capabilities["members.invite"], json!(true));
        assert_eq!(capabilities["labels.create"], json!(true));
        assert_eq!(capabilities["workspace.settings"], json!(false));
        assert_eq!(capabilities["workspace.delete"], json!(false));
        assert!(assignable(&body).is_empty());
    }

    #[sqlx::test(migrations = "./migrations")]
    #[ignore = "needs DATABASE_URL to a disposable Postgres"]
    async fn a_manager_role_gives_its_live_managed_roles_within_its_capabilities(pool: PgPool) {
        let owner = user(&pool).await;
        let workspace = workspace_of(&pool, owner).await;
        let lead = custom_role(&pool, workspace, "support-lead", &[Capability::MembersView]).await;
        let support = custom_role(&pool, workspace, "support", &[Capability::MembersView]).await;
        let beyond = custom_role(&pool, workspace, "cleaners", &[Capability::MembersRemove]).await;
        let gone = custom_role(&pool, workspace, "gone", &[]).await;
        for managed in [support, beyond, gone] {
            manages(&pool, workspace, lead, managed).await;
        }
        sqlx::query("UPDATE roles SET deleted_at = CURRENT_TIMESTAMP WHERE id = $1")
            .bind(gone)
            .execute(&pool)
            .await
            .unwrap();
        let ray = user(&pool).await;
        join(&pool, workspace, ray, &[lead]).await;

        let (_, body) = me(&pool, ray, workspace).await;

        assert_eq!(assignable(&body), sorted(&[support]));
        assert_eq!(body["capabilities"]["roles.manage"], json!(false));
    }

    #[sqlx::test(migrations = "./migrations")]
    #[ignore = "needs DATABASE_URL to a disposable Postgres"]
    async fn a_guest_has_no_roles_and_may_do_nothing(pool: PgPool) {
        let owner = user(&pool).await;
        let workspace = workspace_of(&pool, owner).await;
        let guest = user(&pool).await;
        join(&pool, workspace, guest, &[]).await;

        let (status, body) = me(&pool, guest, workspace).await;

        assert_eq!(status, StatusCode::OK);
        assert_eq!(body["roles"], json!([]));
        let capabilities = body["capabilities"].as_object().unwrap();
        for (name, value) in capabilities {
            if name == "roles.assign" {
                assert_eq!(value, &json!([]));
            } else {
                assert_eq!(value, &json!(false), "{name}");
            }
        }
    }

    #[sqlx::test(migrations = "./migrations")]
    #[ignore = "needs DATABASE_URL to a disposable Postgres"]
    async fn a_deleted_workspace_gives_no_rights_even_to_its_owner(pool: PgPool) {
        let owner = user(&pool).await;
        let workspace = workspace_of(&pool, owner).await;
        sqlx::query("UPDATE workspaces SET deleted_at = CURRENT_TIMESTAMP WHERE id = $1")
            .bind(workspace)
            .execute(&pool)
            .await
            .unwrap();

        assert_eq!(me(&pool, owner, workspace).await.0, StatusCode::NOT_FOUND);
    }
}
