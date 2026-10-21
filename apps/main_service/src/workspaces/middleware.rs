use std::collections::HashSet;

use axum::{
    Extension,
    extract::{Request, State},
    middleware::Next,
    response::Response,
};
use error_handlers::{ApiError, ErrorCode, extract::ApiPath};
use serde::Deserialize;
use sql_models::workspace::model::{BuiltinRole, Capability, Member, Role, Workspace};
use sqlx::PgPool;
use uuid::Uuid;

use crate::workspaces::{repo, service};

#[derive(Deserialize)]
pub struct WorkspacePath {
    workspace_id: Uuid,
}

#[derive(Clone)]
pub struct WorkspaceContext {
    pub workspace: Workspace,
    pub member: Member,
    pub roles: Vec<Role>,

    capabilities: HashSet<Capability>,
}

impl WorkspaceContext {
    pub fn new(workspace: Workspace, member: Member, roles: Vec<Role>) -> Self {
        let capabilities = if member.is_owner {
            Capability::GRANTABLE
                .into_iter()
                .chain(Capability::OWNER_ONLY)
                .collect()
        } else if roles.iter().any(|r| r.builtin == Some(BuiltinRole::Admin)) {
            Capability::GRANTABLE.into_iter().collect()
        } else {
            roles
                .iter()
                .flat_map(|r| r.capabilities.iter().copied())
                .collect()
        };

        Self {
            workspace,
            member,
            roles,
            capabilities,
        }
    }

    pub fn can(&self, capability: Capability) -> bool {
        self.capabilities.contains(&capability)
    }

    pub fn authorize(&self, capability: Capability) -> Result<(), ApiError> {
        if self.can(capability) {
            Ok(())
        } else {
            Err(ApiError::new(ErrorCode::AccessDenied {
                capability: capability.to_string(),
            }))
        }
    }

    pub fn is_guest(&self) -> bool {
        !self.member.is_owner && self.roles.is_empty()
    }

    /// The owner, or a member with the built-in Admin role.
    pub fn is_admin(&self) -> bool {
        self.member.is_owner
            || self
                .roles
                .iter()
                .any(|role| role.builtin == Some(BuiltinRole::Admin))
    }

    /// Whether this member may give and take `role` (access spec §2.4). `managed` — the roles a
    /// role of theirs manages ("Managed by", `role_managers`).
    ///
    /// The owner may give any role. Admin is given only by an admin. Any other role needs
    /// `roles.assign` or a role managing it, and gives nothing the member does not have.
    pub fn can_assign(&self, role: &Role, managed: &HashSet<Uuid>) -> bool {
        if role.deleted_at.is_some() || role.workspace_id != self.workspace.id {
            return false;
        }
        if self.member.is_owner {
            return true;
        }
        if role.builtin == Some(BuiltinRole::Admin) {
            return self.is_admin();
        }

        let may_give = self.can(Capability::RolesAssign) || managed.contains(&role.id);
        may_give
            && role
                .capabilities
                .iter()
                .all(|capability| self.can(*capability))
    }
}

/// The member's context, or `404` when they cannot see the workspace: not a member, deactivated,
/// or the workspace is deleted — which its owner still sees when `owner_sees_deleted`, for as
/// long as it can be restored. The layers below use it, and so does `service` for the checks of
/// other modules.
pub async fn load_context(
    pool: &PgPool,
    user_id: Uuid,
    workspace_id: Uuid,
    owner_sees_deleted: bool,
) -> Result<WorkspaceContext, ApiError> {
    let member = repo::get_member_in_workspace(pool, user_id, workspace_id).await?;

    if member.deactivated_at.is_some() {
        return Err(ApiError::new(ErrorCode::NotFound));
    }

    let (workspace, roles) = tokio::try_join!(
        repo::get_workspace_by_id(pool, &workspace_id),
        repo::get_roles_by_workspace_ids(pool, user_id, vec![workspace_id])
    )?;

    if let Some(deleted_at) = workspace.deleted_at
        && !(owner_sees_deleted && member.is_owner && service::is_restorable(deleted_at))
    {
        return Err(ApiError::new(ErrorCode::NotFound));
    }

    Ok(WorkspaceContext::new(workspace, member, roles))
}

/// The layer for every route under `/workspaces/{workspace_id}`: a deleted workspace is `404`
/// for everyone.
pub async fn load_workspace_context(
    State(pool): State<PgPool>,
    Extension(user_id): Extension<Uuid>,
    ApiPath(path): ApiPath<WorkspacePath>,
    mut request: Request,
    next: Next,
) -> Result<Response, ApiError> {
    let context = load_context(&pool, user_id, path.workspace_id, false).await?;
    request.extensions_mut().insert(context);

    Ok(next.run(request).await)
}

/// The layer for the few routes the owner needs on a deleted workspace (reading it, restoring
/// it); everyone else still gets `404`.
pub async fn load_workspace_context_with_deleted(
    State(pool): State<PgPool>,
    Extension(user_id): Extension<Uuid>,
    ApiPath(path): ApiPath<WorkspacePath>,
    mut request: Request,
    next: Next,
) -> Result<Response, ApiError> {
    let context = load_context(&pool, user_id, path.workspace_id, true).await?;
    request.extensions_mut().insert(context);

    Ok(next.run(request).await)
}

#[cfg(test)]
mod tests {
    use chrono::Utc;

    use super::*;

    const WS: Uuid = Uuid::from_u128(0x0a);

    fn workspace() -> Workspace {
        Workspace {
            id: WS,
            name: "Verso team".into(),
            slug: "verso-team".into(),
            task_prefix: "VT".into(),
            icon_asset_id: None,
            access_epoch: 0,
            version: 1,
            created_at: Utc::now(),
            updated_at: Utc::now(),
            deleted_at: None,
        }
    }

    fn member(is_owner: bool) -> Member {
        Member {
            workspace_id: WS,
            user_id: Uuid::now_v7(),
            is_owner,
            invited_by: None,
            joined_at: Utc::now(),
            deactivated_at: None,
        }
    }

    fn role(builtin: Option<BuiltinRole>, capabilities: &[Capability]) -> Role {
        Role {
            id: Uuid::now_v7(),
            workspace_id: WS,
            name: "Role".into(),
            slug: "role".into(),
            color: 1,
            description: None,
            builtin,
            capabilities: capabilities.to_vec(),
            position: 0,
            created_by: None,
            version: 1,
            created_at: Utc::now(),
            updated_at: Utc::now(),
            deleted_at: None,
        }
    }

    fn context(is_owner: bool, roles: Vec<Role>) -> WorkspaceContext {
        WorkspaceContext::new(workspace(), member(is_owner), roles)
    }

    #[test]
    fn the_owner_can_everything_even_without_roles() {
        let owner = context(true, vec![]);

        for capability in Capability::GRANTABLE
            .into_iter()
            .chain(Capability::OWNER_ONLY)
        {
            assert!(owner.can(capability), "{capability}");
        }
        assert!(!owner.is_guest());
    }

    #[test]
    fn admin_can_every_grantable_capability_but_not_the_owners() {
        // Admin stores no capabilities: the flag gives them
        let admin = context(false, vec![role(Some(BuiltinRole::Admin), &[])]);

        for capability in Capability::GRANTABLE {
            assert!(admin.can(capability), "{capability}");
        }
        for capability in Capability::OWNER_ONLY {
            assert!(!admin.can(capability), "{capability}");
        }
    }

    #[test]
    fn other_roles_give_the_union_of_their_capabilities() {
        let member = context(
            false,
            vec![
                role(
                    Some(BuiltinRole::Member),
                    &[Capability::MembersView, Capability::LabelsCreate],
                ),
                role(None, &[Capability::LabelsManage]),
            ],
        );

        assert!(member.can(Capability::MembersView));
        assert!(member.can(Capability::LabelsCreate));
        assert!(member.can(Capability::LabelsManage));
        assert!(!member.can(Capability::WorkspaceSettings));
        assert!(!member.can(Capability::WorkspaceDelete));
    }

    #[test]
    fn a_member_without_roles_is_a_guest_and_can_nothing() {
        let guest = context(false, vec![]);

        assert!(guest.is_guest());
        for capability in Capability::GRANTABLE {
            assert!(!guest.can(capability), "{capability}");
        }
    }

    fn managed(roles: &[&Role]) -> HashSet<Uuid> {
        roles.iter().map(|role| role.id).collect()
    }

    #[test]
    fn the_owner_may_assign_any_live_role() {
        let owner = context(true, vec![]);
        let admin = role(Some(BuiltinRole::Admin), &[]);
        let custom = role(None, &[Capability::MembersRemove]);
        let mut deleted = role(None, &[]);
        deleted.deleted_at = Some(Utc::now());

        assert!(owner.can_assign(&admin, &HashSet::new()));
        assert!(owner.can_assign(&custom, &HashSet::new()));
        assert!(!owner.can_assign(&deleted, &HashSet::new()));
    }

    #[test]
    fn only_an_admin_assigns_admin() {
        let admin_role = role(Some(BuiltinRole::Admin), &[]);
        let admin = context(false, vec![admin_role.clone()]);
        let assigner = context(
            false,
            vec![role(
                None,
                &[Capability::RolesAssign, Capability::MembersView],
            )],
        );

        assert!(admin.can_assign(&admin_role, &HashSet::new()));
        assert!(!assigner.can_assign(&admin_role, &managed(&[&admin_role])));
    }

    #[test]
    fn roles_assign_gives_only_roles_within_ones_own_capabilities() {
        let assigner = context(
            false,
            vec![role(
                None,
                &[Capability::RolesAssign, Capability::MembersView],
            )],
        );
        let within = role(Some(BuiltinRole::Member), &[Capability::MembersView]);
        let beyond = role(None, &[Capability::MembersRemove]);

        assert!(assigner.can_assign(&within, &HashSet::new()));
        assert!(!assigner.can_assign(&beyond, &HashSet::new()));
    }

    #[test]
    fn a_manager_role_gives_only_the_roles_it_manages() {
        let lead = role(None, &[Capability::MembersView]);
        let support = role(None, &[Capability::MembersView]);
        let other = role(None, &[]);
        let manager = context(false, vec![lead]);

        assert!(manager.can_assign(&support, &managed(&[&support])));
        assert!(!manager.can_assign(&other, &managed(&[&support])));
    }

    #[test]
    fn a_managed_role_beyond_ones_capabilities_is_still_refused() {
        let manager = context(false, vec![role(None, &[])]);
        let support = role(None, &[Capability::LabelsManage]);

        assert!(!manager.can_assign(&support, &managed(&[&support])));
    }

    #[test]
    fn a_guest_assigns_nothing() {
        let guest = context(false, vec![]);
        let plain = role(None, &[]);

        assert!(!guest.can_assign(&plain, &HashSet::new()));
        assert!(!guest.is_admin());
    }

    #[test]
    fn authorize_names_the_missing_capability() {
        let member = context(false, vec![role(None, &[Capability::MembersView])]);

        assert!(member.authorize(Capability::MembersView).is_ok());

        let error = member.authorize(Capability::WorkspaceSettings).unwrap_err();
        assert_eq!(error.status(), 403);
        assert_eq!(
            error.code(),
            &ErrorCode::AccessDenied {
                capability: "workspace.settings".into()
            }
        );
    }

    // Needs a disposable Postgres; `#[sqlx::test]` creates a fresh database per test there:
    //   DATABASE_URL=postgres://test:test@127.0.0.1:55432/postgres cargo test -p main_service -- --ignored
    // Never point it at a shared database.
    mod layers {
        use axum::{
            Router,
            body::{Body, to_bytes},
            http::{Request, StatusCode},
            middleware::from_fn_with_state,
            routing::get,
        };
        use serde_json::Value;
        use tower::ServiceExt;

        use super::*;
        use crate::workspaces::controllers::get_workspace_by_id::get_workspace_by_id;

        /// `/` behind the owner-sees-deleted layer, like the real router; `/live` behind the
        /// default one. `user_id` stands in for `auth_guard`.
        fn app(pool: &PgPool, user_id: Uuid) -> Router {
            let with_deleted = Router::new()
                .route("/", get(get_workspace_by_id))
                .route_layer(from_fn_with_state(
                    pool.clone(),
                    load_workspace_context_with_deleted,
                ));
            let live = Router::new()
                .route(
                    "/live",
                    get(
                        |Extension(context): Extension<WorkspaceContext>| async move {
                            context.workspace.id.to_string()
                        },
                    ),
                )
                .route_layer(from_fn_with_state(pool.clone(), load_workspace_context));

            Router::new()
                .nest("/workspaces/{workspace_id}", with_deleted.merge(live))
                .layer(Extension(user_id))
        }

        async fn get_as(pool: &PgPool, user_id: Uuid, path: &str) -> (StatusCode, Value) {
            let response = app(pool, user_id)
                .oneshot(Request::get(path).body(Body::empty()).unwrap())
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

        /// A workspace owned by `owner`, created the way `POST /workspaces` does.
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

        async fn join(pool: &PgPool, workspace_id: Uuid, user_id: Uuid) {
            sqlx::query("INSERT INTO members (workspace_id, user_id) VALUES ($1, $2)")
                .bind(workspace_id)
                .bind(user_id)
                .execute(pool)
                .await
                .unwrap();
        }

        #[sqlx::test(migrations = "./migrations")]
        #[ignore = "needs DATABASE_URL to a disposable Postgres"]
        async fn a_member_gets_the_workspace(pool: PgPool) {
            let (owner, member) = (user(&pool).await, user(&pool).await);
            let workspace = workspace_of(&pool, owner).await;
            join(&pool, workspace, member).await;

            for user_id in [owner, member] {
                let (status, body) =
                    get_as(&pool, user_id, &format!("/workspaces/{workspace}")).await;
                assert_eq!(status, StatusCode::OK);
                assert_eq!(body["id"], workspace.to_string());
                assert_eq!(body["deletedAt"], Value::Null);

                let path = format!("/workspaces/{workspace}/live");
                assert_eq!(get_as(&pool, user_id, &path).await.0, StatusCode::OK);
            }
        }

        #[sqlx::test(migrations = "./migrations")]
        #[ignore = "needs DATABASE_URL to a disposable Postgres"]
        async fn a_non_member_and_an_unknown_workspace_are_both_not_found(pool: PgPool) {
            let (owner, stranger) = (user(&pool).await, user(&pool).await);
            let workspace = workspace_of(&pool, owner).await;

            for path in [
                format!("/workspaces/{workspace}"),
                format!("/workspaces/{workspace}/live"),
            ] {
                assert_eq!(
                    get_as(&pool, stranger, &path).await.0,
                    StatusCode::NOT_FOUND
                );
            }
            // The same answer: an id reveals nothing
            let unknown = format!("/workspaces/{}", Uuid::now_v7());
            assert_eq!(
                get_as(&pool, owner, &unknown).await.0,
                StatusCode::NOT_FOUND
            );
        }

        #[sqlx::test(migrations = "./migrations")]
        #[ignore = "needs DATABASE_URL to a disposable Postgres"]
        async fn a_deactivated_member_is_not_found(pool: PgPool) {
            let (owner, member) = (user(&pool).await, user(&pool).await);
            let workspace = workspace_of(&pool, owner).await;
            join(&pool, workspace, member).await;
            sqlx::query(
                "UPDATE members SET deactivated_at = CURRENT_TIMESTAMP
                 WHERE workspace_id = $1 AND user_id = $2",
            )
            .bind(workspace)
            .bind(member)
            .execute(&pool)
            .await
            .unwrap();

            let path = format!("/workspaces/{workspace}");
            assert_eq!(get_as(&pool, member, &path).await.0, StatusCode::NOT_FOUND);
        }

        #[sqlx::test(migrations = "./migrations")]
        #[ignore = "needs DATABASE_URL to a disposable Postgres"]
        async fn a_deleted_workspace_is_seen_only_by_its_owner_and_only_where_allowed(
            pool: PgPool,
        ) {
            let (owner, member) = (user(&pool).await, user(&pool).await);
            let workspace = workspace_of(&pool, owner).await;
            join(&pool, workspace, member).await;
            sqlx::query("UPDATE workspaces SET deleted_at = CURRENT_TIMESTAMP WHERE id = $1")
                .bind(workspace)
                .execute(&pool)
                .await
                .unwrap();
            let read = format!("/workspaces/{workspace}");
            let live = format!("/workspaces/{workspace}/live");

            let (status, body) = get_as(&pool, owner, &read).await;
            assert_eq!(status, StatusCode::OK);
            assert!(body["deletedAt"].is_string(), "{body}");

            assert_eq!(get_as(&pool, owner, &live).await.0, StatusCode::NOT_FOUND);
            assert_eq!(get_as(&pool, member, &read).await.0, StatusCode::NOT_FOUND);
            assert_eq!(get_as(&pool, member, &live).await.0, StatusCode::NOT_FOUND);
        }

        #[sqlx::test(migrations = "./migrations")]
        #[ignore = "needs DATABASE_URL to a disposable Postgres"]
        async fn the_context_carries_the_members_roles_and_capabilities(pool: PgPool) {
            let (owner, guest) = (user(&pool).await, user(&pool).await);
            let workspace = workspace_of(&pool, owner).await;
            join(&pool, workspace, guest).await;

            let owners = load_context(&pool, owner, workspace, false).await.unwrap();
            assert!(owners.can(Capability::WorkspaceDelete));
            assert_eq!(owners.roles.len(), 1);
            assert_eq!(owners.roles[0].builtin, Some(BuiltinRole::Admin));

            let guests = load_context(&pool, guest, workspace, false).await.unwrap();
            assert!(guests.is_guest());
            assert!(!guests.can(Capability::MembersView));
        }
    }
}
