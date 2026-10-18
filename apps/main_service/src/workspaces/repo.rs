use sql_models::workspace::model::{Capability, Member, Role, Workspace};
use sqlx::Executor;
use uuid::Uuid;

// WORKSPACES

/// Whether `slug` is used by a workspace (a deleted one keeps it for its restore) or by a live
/// alias of an old slug.
pub async fn is_slug_taken<'a>(
    pool: impl Executor<'a, Database = sqlx::Postgres>,
    slug: &str,
) -> Result<bool, sqlx::Error> {
    sqlx::query_scalar(
        "SELECT
            EXISTS (
                SELECT 1
                FROM workspaces
                WHERE slug = $1
            )
            OR
            EXISTS (
                SELECT 1
                FROM workspace_slug_aliases
                WHERE slug = $1 AND expires_at > CURRENT_TIMESTAMP
            )
        ",
    )
    .bind(slug)
    .fetch_one(pool)
    .await
}

/// Whether `slug` is the current slug, or a live alias, of `workspace_id`, and `user_id` is an
/// active member of it: the slug is that workspace's own address, not someone else's.
pub async fn is_own_slug<'a>(
    executor: impl Executor<'a, Database = sqlx::Postgres>,
    user_id: Uuid,
    workspace_id: Uuid,
    slug: &str,
) -> Result<bool, sqlx::Error> {
    sqlx::query_scalar(
        "SELECT EXISTS (
            SELECT 1
            FROM workspaces w
            JOIN members m
                ON m.workspace_id = w.id
                AND m.user_id = $2
                AND m.deactivated_at IS NULL
            WHERE w.id = $3
                AND (
                    w.slug = $1
                    OR EXISTS (
                        SELECT 1
                        FROM workspace_slug_aliases a
                        WHERE a.slug = $1
                            AND a.workspace_id = w.id
                            AND a.expires_at > CURRENT_TIMESTAMP
                    )
                )
        )
        ",
    )
    .bind(slug)
    .bind(user_id)
    .bind(workspace_id)
    .fetch_one(executor)
    .await
}

pub async fn get_workspace_by_id<'a>(
    executor: impl Executor<'a, Database = sqlx::Postgres>,
    id: &Uuid,
) -> Result<Workspace, sqlx::Error> {
    sqlx::query_as::<_, Workspace>("SELECT * FROM workspaces WHERE id = $1")
        .bind(id)
        .fetch_one(executor)
        .await
}

/// What the built-in Member role can do in a new workspace (access spec §2.2).
const MEMBERS_CAPABILITIES: &[Capability] = &[
    Capability::MembersView,
    Capability::MembersInvite,
    Capability::PagesCreateRoot,
    Capability::LabelsCreate,
];

pub struct CreateWorkspaceRequest {
    pub id: Uuid,
    pub name: String,
    pub slug: String,
    pub task_prefix: String,
}

pub enum InitWorkspaceResponse {
    Created(Workspace),
    Existed(Workspace),
}

pub async fn init_workspace<'a>(
    executor: impl Executor<'a, Database = sqlx::Postgres> + Copy,
    body: CreateWorkspaceRequest,
    owner_id: &Uuid,
) -> Result<InitWorkspaceResponse, sqlx::Error> {
    let created = sqlx::query_as::<_, Workspace>(
        "WITH created_workspace AS (
            INSERT INTO workspaces (name, slug, task_prefix, id)
            VALUES ($1, $2, $3, $4)
            ON CONFLICT (id) DO NOTHING
            RETURNING *
        ),
        created_prefix AS (
            INSERT INTO workspace_prefixes (workspace_id, prefix)
            SELECT id, $3
            FROM created_workspace
        ),
        created_member AS (
            INSERT INTO members (workspace_id, user_id, is_owner)
            SELECT id, $5, TRUE
            FROM created_workspace
            RETURNING workspace_id, user_id
        ),
        admin_role AS (
            INSERT INTO roles (workspace_id, name, slug, color, builtin, position)
            SELECT id, 'Admin', 'admin', 1, 'admin', 0
            FROM created_workspace
            RETURNING id, workspace_id
        ),
        member_role AS (
            INSERT INTO roles (workspace_id, name, slug, color, builtin, position, capabilities)
            SELECT id, 'Member', 'member', 2, 'member', 1, $6
            FROM created_workspace
        ),
        assigned_admin AS (
            INSERT INTO member_roles (workspace_id, user_id, role_id)
            SELECT cm.workspace_id, cm.user_id, ar.id
            FROM created_member cm
            JOIN admin_role ar ON ar.workspace_id = cm.workspace_id
        )
        SELECT * FROM created_workspace
        ",
    )
    .bind(body.name)
    .bind(body.slug)
    .bind(body.task_prefix)
    .bind(body.id)
    .bind(owner_id)
    .bind(MEMBERS_CAPABILITIES)
    .fetch_optional(executor)
    .await?;

    match created {
        Some(workspace) => Ok(InitWorkspaceResponse::Created(workspace)),
        None => get_workspace_by_id(executor, &body.id)
            .await
            .map(InitWorkspaceResponse::Existed),
    }
}

/// A workspace found by one of its slugs.
#[derive(Debug, sqlx::FromRow)]
pub struct ResolvedSlug {
    pub id: Uuid,
    /// The current slug, which differs from the asked one when that was an old alias.
    pub slug: String,
}

/// The workspace `user_id` is a member of whose slug, or live alias, is `slug`. A non-member,
/// a deactivated member, and anyone but the owner of a deleted workspace get `RowNotFound`.
pub async fn get_workspace_by_slug<'a>(
    executor: impl Executor<'a, Database = sqlx::Postgres>,
    user_id: Uuid,
    slug: &str,
) -> Result<ResolvedSlug, sqlx::Error> {
    sqlx::query_as::<_, ResolvedSlug>(
        "SELECT w.id, w.slug
        FROM workspaces w
        JOIN members m
            ON m.workspace_id = w.id
            AND m.user_id = $2
            AND m.deactivated_at IS NULL
        WHERE (w.deleted_at IS NULL OR m.is_owner)
            AND (
                w.slug = $1
                OR w.id = (
                SELECT workspace_id FROM workspace_slug_aliases
                WHERE slug = $1 AND expires_at > CURRENT_TIMESTAMP
                )
            )
        ",
    )
    .bind(slug.to_ascii_lowercase())
    .bind(user_id)
    .fetch_one(executor)
    .await
}

/// A workspace of the user, with whether they own it.
#[derive(sqlx::FromRow)]
pub struct UserWorkspace {
    #[sqlx(flatten)]
    pub workspace: Workspace,
    pub is_owner: bool,
}

pub async fn get_user_workspaces<'a>(
    executor: impl Executor<'a, Database = sqlx::Postgres>,
    user_id: Uuid,
) -> Result<Vec<UserWorkspace>, sqlx::Error> {
    sqlx::query_as::<_, UserWorkspace>(
        "SELECT w.*, m.is_owner
        FROM workspaces w
        JOIN members m
        ON m.workspace_id = w.id
        WHERE m.user_id = $1
            AND m.deactivated_at IS NULL
            AND (
                w.deleted_at IS NULL
                OR (
                    m.is_owner = TRUE
                    AND w.deleted_at >= CURRENT_TIMESTAMP - INTERVAL '30 days'
                )
            )
        ORDER BY lower(w.name)
        ",
    )
    .bind(user_id)
    .fetch_all(executor)
    .await
}

// ROLES

pub async fn get_roles_by_workspace_ids<'a>(
    executor: impl Executor<'a, Database = sqlx::Postgres>,
    user_id: Uuid,
    workspace_ids: Vec<Uuid>,
) -> Result<Vec<Role>, sqlx::Error> {
    sqlx::query_as::<_, Role>(
        "SELECT r.*
        FROM roles r
        JOIN member_roles mr ON mr.role_id = r.id
        WHERE mr.user_id = $1
        AND r.workspace_id = ANY($2)
        AND r.deleted_at IS NULL
        ORDER BY r.workspace_id, r.position
        ",
    )
    .bind(user_id)
    .bind(workspace_ids)
    .fetch_all(executor)
    .await
}

/// The live roles of the workspace, in their order.
pub async fn get_workspace_roles<'a>(
    executor: impl Executor<'a, Database = sqlx::Postgres>,
    workspace_id: Uuid,
) -> Result<Vec<Role>, sqlx::Error> {
    sqlx::query_as::<_, Role>(
        "SELECT *
        FROM roles
        WHERE workspace_id = $1
            AND deleted_at IS NULL
        ORDER BY position
        ",
    )
    .bind(workspace_id)
    .fetch_all(executor)
    .await
}

// MEMBERS

pub async fn get_member_in_workspace<'a>(
    executor: impl Executor<'a, Database = sqlx::Postgres>,
    user_id: Uuid,
    workspace_id: Uuid,
) -> Result<Member, sqlx::Error> {
    sqlx::query_as::<_, Member>(
        "SELECT *
        FROM members
        WHERE user_id = $1
            AND workspace_id = $2
        ",
    )
    .bind(user_id)
    .bind(workspace_id)
    .fetch_one(executor)
    .await
}

// SLUGS

pub async fn find_similar_slugs<'a>(
    executor: impl Executor<'a, Database = sqlx::Postgres>,
    slug: &str,
) -> Result<Vec<String>, sqlx::Error> {
    sqlx::query_scalar::<_, String>(
        "SELECT slug
        FROM workspaces
        WHERE slug = $1
            OR slug ~ ('^' || $1 || '-[0-9]+$')
        UNION ALL
        SELECT slug
        FROM workspace_slug_aliases
        WHERE slug = $1
            OR slug ~ ('^' || $1 || '-[0-9]+$')
        ",
    )
    .bind(slug)
    .fetch_all(executor)
    .await
}

// ROLE MANAGERS

/// The roles that any of `role_ids` manages: their members may give and take them.
pub async fn get_roles_managed_by<'a>(
    executor: impl Executor<'a, Database = sqlx::Postgres>,
    role_ids: &[Uuid],
) -> Result<Vec<Uuid>, sqlx::Error> {
    sqlx::query_scalar::<_, Uuid>(
        "SELECT DISTINCT role_id
        FROM role_managers
        WHERE manager_role_id = ANY($1)
        ",
    )
    .bind(role_ids)
    .fetch_all(executor)
    .await
}

// Needs a disposable Postgres; `#[sqlx::test]` creates a fresh database per test there:
//   DATABASE_URL=postgres://test:test@127.0.0.1:55432/postgres cargo test -p main_service -- --ignored
// Never point it at a shared database.
#[cfg(test)]
mod tests {
    use sql_models::workspace::model::{BuiltinRole, Role};
    use sqlx::PgPool;

    use super::*;

    async fn user(pool: &PgPool) -> Uuid {
        let id = Uuid::now_v7();
        sqlx::query("INSERT INTO users (id, username) VALUES ($1, 'test')")
            .bind(id)
            .execute(pool)
            .await
            .unwrap();
        id
    }

    fn request(id: Uuid, slug: &str) -> CreateWorkspaceRequest {
        CreateWorkspaceRequest {
            id,
            name: "Verso team".into(),
            slug: slug.into(),
            task_prefix: "VT".into(),
        }
    }

    async fn create(pool: &PgPool, owner: Uuid, slug: &str) -> Workspace {
        match init_workspace(pool, request(Uuid::now_v7(), slug), &owner)
            .await
            .unwrap()
        {
            InitWorkspaceResponse::Created(workspace) => workspace,
            InitWorkspaceResponse::Existed(_) => panic!("a new id must create"),
        }
    }

    async fn roles(pool: &PgPool, workspace_id: Uuid) -> Vec<Role> {
        sqlx::query_as("SELECT * FROM roles WHERE workspace_id = $1 ORDER BY position")
            .bind(workspace_id)
            .fetch_all(pool)
            .await
            .unwrap()
    }

    #[sqlx::test(migrations = "./migrations")]
    #[ignore = "needs DATABASE_URL to a disposable Postgres"]
    async fn creates_the_workspace_with_its_built_in_roles_and_its_owner(pool: PgPool) {
        let owner = user(&pool).await;

        let workspace = create(&pool, owner, "verso-team").await;

        assert_eq!(
            (workspace.name.as_str(), workspace.slug.as_str()),
            ("Verso team", "verso-team")
        );
        assert_eq!(workspace.version, 1);
        assert_eq!(workspace.deleted_at, None);

        let roles = roles(&pool, workspace.id).await;
        let shape: Vec<_> = roles
            .iter()
            .map(|r| (r.name.as_str(), r.slug.as_str(), r.builtin))
            .collect();
        assert_eq!(
            shape,
            [
                ("Admin", "admin", Some(BuiltinRole::Admin)),
                ("Member", "member", Some(BuiltinRole::Member)),
            ]
        );
        assert!(roles[0].capabilities.is_empty());
        assert_eq!(roles[1].capabilities, MEMBERS_CAPABILITIES);

        let member = get_member_in_workspace(&pool, owner, workspace.id)
            .await
            .unwrap();
        assert!(member.is_owner);

        let owner_roles: Vec<Uuid> = sqlx::query_scalar(
            "SELECT role_id FROM member_roles WHERE workspace_id = $1 AND user_id = $2",
        )
        .bind(workspace.id)
        .bind(owner)
        .fetch_all(&pool)
        .await
        .unwrap();
        assert_eq!(owner_roles, [roles[0].id]);

        let prefixes: Vec<(String, Option<chrono::DateTime<chrono::Utc>>)> = sqlx::query_as(
            "SELECT prefix, used_until FROM workspace_prefixes WHERE workspace_id = $1",
        )
        .bind(workspace.id)
        .fetch_all(&pool)
        .await
        .unwrap();
        assert_eq!(prefixes, [("VT".to_string(), None)]);
    }

    #[sqlx::test(migrations = "./migrations")]
    #[ignore = "needs DATABASE_URL to a disposable Postgres"]
    async fn the_same_id_again_returns_the_workspace_and_creates_nothing_more(pool: PgPool) {
        let owner = user(&pool).await;
        let id = Uuid::now_v7();
        init_workspace(&pool, request(id, "verso-team"), &owner)
            .await
            .unwrap();

        let again = init_workspace(&pool, request(id, "other-slug"), &owner)
            .await
            .unwrap();

        let InitWorkspaceResponse::Existed(workspace) = again else {
            panic!("the same id must not create again");
        };
        assert_eq!(workspace.slug, "verso-team");
        assert_eq!(roles(&pool, id).await.len(), 2);
    }

    #[sqlx::test(migrations = "./migrations")]
    #[ignore = "needs DATABASE_URL to a disposable Postgres"]
    async fn a_taken_slug_fails_on_its_own_constraint(pool: PgPool) {
        let owner = user(&pool).await;
        create(&pool, owner, "verso-team").await;

        let error = init_workspace(&pool, request(Uuid::now_v7(), "verso-team"), &owner)
            .await
            .err()
            .unwrap();

        // The controller turns exactly this into `slug: TAKEN`
        let constraint = error
            .as_database_error()
            .and_then(|db| db.constraint().map(str::to_owned));
        assert_eq!(constraint.as_deref(), Some("workspaces_slug_key"));
    }

    #[sqlx::test(migrations = "./migrations")]
    #[ignore = "needs DATABASE_URL to a disposable Postgres"]
    async fn a_slug_is_taken_by_a_workspace_or_a_live_alias(pool: PgPool) {
        let owner = user(&pool).await;
        let workspace = create(&pool, owner, "verso-team").await;
        sqlx::query(
            "INSERT INTO workspace_slug_aliases (slug, workspace_id, expires_at) VALUES
               ('old-live', $1, CURRENT_TIMESTAMP + interval '1 day'),
               ('old-gone', $1, CURRENT_TIMESTAMP - interval '1 day')",
        )
        .bind(workspace.id)
        .execute(&pool)
        .await
        .unwrap();

        assert!(is_slug_taken(&pool, "verso-team").await.unwrap());
        assert!(is_slug_taken(&pool, "old-live").await.unwrap());
        assert!(!is_slug_taken(&pool, "old-gone").await.unwrap());
        assert!(!is_slug_taken(&pool, "free").await.unwrap());
    }

    #[sqlx::test(migrations = "./migrations")]
    #[ignore = "needs DATABASE_URL to a disposable Postgres"]
    async fn similar_slugs_are_the_base_and_its_numbered_ones(pool: PgPool) {
        let owner = user(&pool).await;
        for slug in ["verso", "verso-2", "verso-team", "versoo"] {
            create(&pool, owner, slug).await;
        }

        let mut similar = find_similar_slugs(&pool, "verso").await.unwrap();
        similar.sort();

        assert_eq!(similar, ["verso", "verso-2"]);
    }

    /// Joins `user` to the workspace, not as its owner, with these roles.
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

    async fn custom_role(pool: &PgPool, workspace_id: Uuid, slug: &str, position: i32) -> Uuid {
        sqlx::query_scalar(
            "INSERT INTO roles (workspace_id, name, slug, color, position)
             VALUES ($1, $2, $2, 3, $3) RETURNING id",
        )
        .bind(workspace_id)
        .bind(slug)
        .bind(position)
        .fetch_one(pool)
        .await
        .unwrap()
    }

    async fn rename(pool: &PgPool, workspace_id: Uuid, name: &str) {
        sqlx::query("UPDATE workspaces SET name = $2 WHERE id = $1")
            .bind(workspace_id)
            .bind(name)
            .execute(pool)
            .await
            .unwrap();
    }

    async fn deleted_days_ago(pool: &PgPool, workspace_id: Uuid, days: i32) {
        sqlx::query(
            "UPDATE workspaces SET deleted_at = CURRENT_TIMESTAMP - make_interval(days => $2)
             WHERE id = $1",
        )
        .bind(workspace_id)
        .bind(days)
        .execute(pool)
        .await
        .unwrap();
    }

    /// `(name, is_owner)` of the user's list, in its order.
    async fn listed(pool: &PgPool, user_id: Uuid) -> Vec<(String, bool)> {
        get_user_workspaces(pool, user_id)
            .await
            .unwrap()
            .into_iter()
            .map(|w| (w.workspace.name, w.is_owner))
            .collect()
    }

    async fn role_slugs(pool: &PgPool, user_id: Uuid, workspace_ids: Vec<Uuid>) -> Vec<String> {
        get_roles_by_workspace_ids(pool, user_id, workspace_ids)
            .await
            .unwrap()
            .into_iter()
            .map(|r| r.slug)
            .collect()
    }

    #[sqlx::test(migrations = "./migrations")]
    #[ignore = "needs DATABASE_URL to a disposable Postgres"]
    async fn lists_the_users_own_workspaces_by_name_with_the_owner_flag(pool: PgPool) {
        let (me, other) = (user(&pool).await, user(&pool).await);
        let beta = create(&pool, me, "beta").await;
        let alpha = create(&pool, me, "alpha").await;
        let gamma = create(&pool, other, "gamma").await;
        let foreign = create(&pool, other, "foreign").await;
        rename(&pool, beta.id, "Beta").await;
        rename(&pool, alpha.id, "Alpha").await;
        rename(&pool, gamma.id, "Gamma").await;
        rename(&pool, foreign.id, "Foreign").await;
        join(&pool, gamma.id, me, &[]).await;

        assert_eq!(
            listed(&pool, me).await,
            [
                ("Alpha".to_string(), true),
                ("Beta".to_string(), true),
                ("Gamma".to_string(), false),
            ]
        );
        assert_eq!(
            listed(&pool, other).await,
            [("Foreign".to_string(), true), ("Gamma".to_string(), true)]
        );
    }

    #[sqlx::test(migrations = "./migrations")]
    #[ignore = "needs DATABASE_URL to a disposable Postgres"]
    async fn a_deleted_workspace_stays_in_its_owners_list_for_30_days_only(pool: PgPool) {
        let (owner, member) = (user(&pool).await, user(&pool).await);
        let workspace = create(&pool, owner, "verso-team").await;
        join(&pool, workspace.id, member, &[]).await;

        deleted_days_ago(&pool, workspace.id, 10).await;

        let owners = get_user_workspaces(&pool, owner).await.unwrap();
        assert_eq!(owners.len(), 1);
        assert!(owners[0].workspace.deleted_at.is_some());
        assert!(listed(&pool, member).await.is_empty());

        deleted_days_ago(&pool, workspace.id, 31).await;

        assert!(listed(&pool, owner).await.is_empty());
    }

    #[sqlx::test(migrations = "./migrations")]
    #[ignore = "needs DATABASE_URL to a disposable Postgres"]
    async fn a_deactivated_member_does_not_see_the_workspace(pool: PgPool) {
        let (owner, member) = (user(&pool).await, user(&pool).await);
        let workspace = create(&pool, owner, "verso-team").await;
        join(&pool, workspace.id, member, &[]).await;
        sqlx::query(
            "UPDATE members SET deactivated_at = CURRENT_TIMESTAMP
             WHERE workspace_id = $1 AND user_id = $2",
        )
        .bind(workspace.id)
        .bind(member)
        .execute(&pool)
        .await
        .unwrap();

        assert!(listed(&pool, member).await.is_empty());
        assert_eq!(listed(&pool, owner).await.len(), 1);
    }

    #[sqlx::test(migrations = "./migrations")]
    #[ignore = "needs DATABASE_URL to a disposable Postgres"]
    async fn roles_are_the_users_own_live_ones_by_position(pool: PgPool) {
        let (owner, member, guest) = (user(&pool).await, user(&pool).await, user(&pool).await);
        let workspace = create(&pool, owner, "verso-team").await;
        let built_in = roles(&pool, workspace.id).await;
        let member_role = built_in[1].id;
        let support = custom_role(&pool, workspace.id, "support", 5).await;
        let design = custom_role(&pool, workspace.id, "design", 3).await;
        let gone = custom_role(&pool, workspace.id, "gone", 4).await;
        sqlx::query("UPDATE roles SET deleted_at = CURRENT_TIMESTAMP WHERE id = $1")
            .bind(gone)
            .execute(&pool)
            .await
            .unwrap();
        join(
            &pool,
            workspace.id,
            member,
            &[support, member_role, design, gone],
        )
        .await;
        join(&pool, workspace.id, guest, &[]).await;

        assert_eq!(
            role_slugs(&pool, owner, vec![workspace.id]).await,
            ["admin"]
        );
        assert_eq!(
            role_slugs(&pool, member, vec![workspace.id]).await,
            ["member", "design", "support"]
        );
        assert!(
            role_slugs(&pool, guest, vec![workspace.id])
                .await
                .is_empty()
        );
    }

    #[sqlx::test(migrations = "./migrations")]
    #[ignore = "needs DATABASE_URL to a disposable Postgres"]
    async fn roles_come_only_from_the_asked_workspaces(pool: PgPool) {
        let me = user(&pool).await;
        let first = create(&pool, me, "first").await;
        let second = create(&pool, me, "second").await;

        let roles = get_roles_by_workspace_ids(&pool, me, vec![first.id])
            .await
            .unwrap();

        assert_eq!(roles.len(), 1);
        assert_eq!(roles[0].workspace_id, first.id);
        assert!(role_slugs(&pool, me, vec![]).await.is_empty());
        assert_eq!(
            role_slugs(&pool, me, vec![first.id, second.id]).await,
            ["admin", "admin"]
        );
    }

    async fn alias(pool: &PgPool, workspace_id: Uuid, slug: &str, live: bool) {
        sqlx::query(
            "INSERT INTO workspace_slug_aliases (slug, workspace_id, expires_at)
             VALUES ($1, $2, CURRENT_TIMESTAMP + make_interval(days => $3))",
        )
        .bind(slug)
        .bind(workspace_id)
        .bind(if live { 1 } else { -1 })
        .execute(pool)
        .await
        .unwrap();
    }

    /// `Some((id, current slug))`, or `None` for `RowNotFound` — what the endpoint turns into 404.
    async fn resolve(pool: &PgPool, user_id: Uuid, slug: &str) -> Option<(Uuid, String)> {
        match get_workspace_by_slug(pool, user_id, slug).await {
            Ok(found) => Some((found.id, found.slug)),
            Err(sqlx::Error::RowNotFound) => None,
            Err(error) => panic!("{error}"),
        }
    }

    #[sqlx::test(migrations = "./migrations")]
    #[ignore = "needs DATABASE_URL to a disposable Postgres"]
    async fn a_member_resolves_the_slug_in_any_case(pool: PgPool) {
        let (owner, member) = (user(&pool).await, user(&pool).await);
        let workspace = create(&pool, owner, "verso-team").await;
        join(&pool, workspace.id, member, &[]).await;
        let found = Some((workspace.id, "verso-team".to_string()));

        assert_eq!(resolve(&pool, owner, "verso-team").await, found);
        assert_eq!(resolve(&pool, member, "verso-team").await, found);
        assert_eq!(resolve(&pool, member, "Verso-Team").await, found);
    }

    #[sqlx::test(migrations = "./migrations")]
    #[ignore = "needs DATABASE_URL to a disposable Postgres"]
    async fn an_old_slug_resolves_to_the_current_one_while_its_alias_lives(pool: PgPool) {
        let owner = user(&pool).await;
        let workspace = create(&pool, owner, "verso-labs").await;
        alias(&pool, workspace.id, "verso-team", true).await;
        alias(&pool, workspace.id, "verso-old", false).await;

        assert_eq!(
            resolve(&pool, owner, "verso-team").await,
            Some((workspace.id, "verso-labs".to_string()))
        );
        assert_eq!(resolve(&pool, owner, "verso-old").await, None);
    }

    #[sqlx::test(migrations = "./migrations")]
    #[ignore = "needs DATABASE_URL to a disposable Postgres"]
    async fn a_stranger_gets_the_same_nothing_as_for_an_unknown_slug(pool: PgPool) {
        let (owner, stranger) = (user(&pool).await, user(&pool).await);
        let workspace = create(&pool, owner, "verso-team").await;
        alias(&pool, workspace.id, "verso-old", true).await;

        assert_eq!(resolve(&pool, stranger, "verso-team").await, None);
        assert_eq!(resolve(&pool, stranger, "verso-old").await, None);
        assert_eq!(resolve(&pool, owner, "no-such-slug").await, None);
    }

    #[sqlx::test(migrations = "./migrations")]
    #[ignore = "needs DATABASE_URL to a disposable Postgres"]
    async fn a_deactivated_member_resolves_nothing(pool: PgPool) {
        let (owner, member) = (user(&pool).await, user(&pool).await);
        let workspace = create(&pool, owner, "verso-team").await;
        join(&pool, workspace.id, member, &[]).await;
        sqlx::query(
            "UPDATE members SET deactivated_at = CURRENT_TIMESTAMP
             WHERE workspace_id = $1 AND user_id = $2",
        )
        .bind(workspace.id)
        .bind(member)
        .execute(&pool)
        .await
        .unwrap();

        assert_eq!(resolve(&pool, member, "verso-team").await, None);
    }

    #[sqlx::test(migrations = "./migrations")]
    #[ignore = "needs DATABASE_URL to a disposable Postgres"]
    async fn a_deleted_workspace_resolves_only_for_its_owner(pool: PgPool) {
        let (owner, member) = (user(&pool).await, user(&pool).await);
        let workspace = create(&pool, owner, "verso-team").await;
        join(&pool, workspace.id, member, &[]).await;
        deleted_days_ago(&pool, workspace.id, 1).await;

        assert_eq!(
            resolve(&pool, owner, "verso-team").await,
            Some((workspace.id, "verso-team".to_string()))
        );
        assert_eq!(resolve(&pool, member, "verso-team").await, None);
    }

    #[sqlx::test(migrations = "./migrations")]
    #[ignore = "needs DATABASE_URL to a disposable Postgres"]
    async fn a_workspaces_own_slug_and_live_aliases_are_its_own(pool: PgPool) {
        let (owner, member) = (user(&pool).await, user(&pool).await);
        let workspace = create(&pool, owner, "verso-labs").await;
        join(&pool, workspace.id, member, &[]).await;
        alias(&pool, workspace.id, "verso-team", true).await;
        alias(&pool, workspace.id, "verso-old", false).await;

        for user_id in [owner, member] {
            assert!(
                is_own_slug(&pool, user_id, workspace.id, "verso-labs")
                    .await
                    .unwrap()
            );
            assert!(
                is_own_slug(&pool, user_id, workspace.id, "verso-team")
                    .await
                    .unwrap()
            );
            assert!(
                !is_own_slug(&pool, user_id, workspace.id, "verso-old")
                    .await
                    .unwrap()
            );
        }
    }

    #[sqlx::test(migrations = "./migrations")]
    #[ignore = "needs DATABASE_URL to a disposable Postgres"]
    async fn another_workspaces_slug_is_not_own(pool: PgPool) {
        let owner = user(&pool).await;
        let mine = create(&pool, owner, "mine").await;
        let theirs = create(&pool, user(&pool).await, "theirs").await;
        alias(&pool, theirs.id, "theirs-old", true).await;

        assert!(!is_own_slug(&pool, owner, mine.id, "theirs").await.unwrap());
        assert!(
            !is_own_slug(&pool, owner, mine.id, "theirs-old")
                .await
                .unwrap()
        );
    }

    #[sqlx::test(migrations = "./migrations")]
    #[ignore = "needs DATABASE_URL to a disposable Postgres"]
    async fn a_stranger_learns_nothing_about_whose_slug_it_is(pool: PgPool) {
        let stranger = user(&pool).await;
        let workspace = create(&pool, user(&pool).await, "verso-team").await;

        assert!(
            !is_own_slug(&pool, stranger, workspace.id, "verso-team")
                .await
                .unwrap()
        );
    }
}
