use chrono::{DateTime, Utc};
use sql_models::page::model::{Page, PageIcon, PageType};
use sqlx::{Executor, Postgres, types::Json};
use uuid::Uuid;

/// The primary key and the `UNIQUE` of `short_id`: what an insert of a page collides on.
pub const ID_CONSTRAINT: &str = "pages_pkey";
pub const SHORT_ID_CONSTRAINT: &str = "pages_short_id_key";

/// Every live page of the workspace, each parent's children in their order.
pub async fn tree<'a>(
    executor: impl Executor<'a, Database = Postgres>,
    workspace_id: Uuid,
) -> Result<Vec<Page>, sqlx::Error> {
    sqlx::query_as::<_, Page>(
        "SELECT * FROM pages
        WHERE workspace_id = $1 AND deleted_at IS NULL
        ORDER BY parent_id NULLS FIRST, position, id",
    )
    .bind(workspace_id)
    .fetch_all(executor)
    .await
}

/// A page of any workspace, live or in the trash.
pub async fn get<'a>(
    executor: impl Executor<'a, Database = Postgres>,
    page_id: Uuid,
) -> Result<Option<Page>, sqlx::Error> {
    sqlx::query_as::<_, Page>("SELECT * FROM pages WHERE id = $1")
        .bind(page_id)
        .fetch_optional(executor)
        .await
}

/// A page of the workspace by its address, live or in the trash.
pub async fn get_by_short_id<'a>(
    executor: impl Executor<'a, Database = Postgres>,
    workspace_id: Uuid,
    short_id: &str,
) -> Result<Option<Page>, sqlx::Error> {
    sqlx::query_as::<_, Page>("SELECT * FROM pages WHERE workspace_id = $1 AND short_id = $2")
        .bind(workspace_id)
        .bind(short_id)
        .fetch_optional(executor)
        .await
}

/// A page of the workspace, locked for the rest of the transaction; live or in the trash.
pub async fn lock<'a>(
    executor: impl Executor<'a, Database = Postgres>,
    workspace_id: Uuid,
    page_id: Uuid,
) -> Result<Option<Page>, sqlx::Error> {
    sqlx::query_as::<_, Page>("SELECT * FROM pages WHERE workspace_id = $1 AND id = $2 FOR UPDATE")
        .bind(workspace_id)
        .bind(page_id)
        .fetch_optional(executor)
        .await
}

/// Holds the order of one parent's children (`parent_id`, or the workspace for the root) until the
/// transaction ends: two pages placed there at once get their keys one after the other.
pub async fn lock_children<'a>(
    executor: impl Executor<'a, Database = Postgres>,
    workspace_id: Uuid,
    parent_id: Option<Uuid>,
) -> Result<(), sqlx::Error> {
    let key = format!("pages:{}", parent_id.unwrap_or(workspace_id));

    sqlx::query("SELECT pg_advisory_xact_lock(hashtextextended($1, 0))")
        .bind(key)
        .execute(executor)
        .await
        .map(|_| ())
}

/// The live children of a parent (the root when `None`) in their order, without `except`: their
/// ids and keys.
pub async fn children<'a>(
    executor: impl Executor<'a, Database = Postgres>,
    workspace_id: Uuid,
    parent_id: Option<Uuid>,
    except: Option<Uuid>,
) -> Result<Vec<(Uuid, String)>, sqlx::Error> {
    sqlx::query_as(
        "SELECT id, position FROM pages
        WHERE workspace_id = $1
            AND parent_id IS NOT DISTINCT FROM $2
            AND deleted_at IS NULL
            AND id IS DISTINCT FROM $3
        ORDER BY position, id",
    )
    .bind(workspace_id)
    .bind(parent_id)
    .bind(except)
    .fetch_all(executor)
    .await
}

/// New keys for siblings that ran out of room. Their place does not change, only its key: no new
/// version.
pub async fn set_positions<'a>(
    executor: impl Executor<'a, Database = Postgres>,
    positions: &[(Uuid, String)],
) -> Result<(), sqlx::Error> {
    let (ids, keys): (Vec<Uuid>, Vec<&str>) = positions
        .iter()
        .map(|(id, key)| (*id, key.as_str()))
        .unzip();

    sqlx::query(
        "UPDATE pages SET position = new.position
        FROM UNNEST($1::uuid[], $2::text[]) AS new (id, position)
        WHERE pages.id = new.id",
    )
    .bind(ids)
    .bind(keys)
    .execute(executor)
    .await
    .map(|_| ())
}

/// The page and its ancestors, from the page up to the root.
pub async fn path_to_root<'a>(
    executor: impl Executor<'a, Database = Postgres>,
    page_id: Uuid,
) -> Result<Vec<Uuid>, sqlx::Error> {
    sqlx::query_scalar(
        "WITH RECURSIVE up AS (
            SELECT id, parent_id, 1 AS depth FROM pages WHERE id = $1
            UNION ALL
            SELECT p.id, p.parent_id, up.depth + 1 FROM pages p JOIN up ON p.id = up.parent_id
        )
        SELECT id FROM up ORDER BY depth",
    )
    .bind(page_id)
    .fetch_all(executor)
    .await
}

/// How many levels the page's live subtree takes: 1 for a page without children.
pub async fn subtree_height<'a>(
    executor: impl Executor<'a, Database = Postgres>,
    page_id: Uuid,
) -> Result<i32, sqlx::Error> {
    sqlx::query_scalar(
        "WITH RECURSIVE down AS (
            SELECT id, 1 AS depth FROM pages WHERE id = $1
            UNION ALL
            SELECT p.id, down.depth + 1 FROM pages p JOIN down ON p.parent_id = down.id
            WHERE p.deleted_at IS NULL
        )
        SELECT max(depth) FROM down",
    )
    .bind(page_id)
    .fetch_one(executor)
    .await
}

pub struct NewPage {
    pub id: Uuid,
    pub workspace_id: Uuid,
    pub parent_id: Option<Uuid>,
    pub position: String,
    pub r#type: PageType,
    pub title: String,
    pub icon: Option<PageIcon>,
    pub short_id: String,
    pub created_by: Uuid,
}

/// Inserts the page with its body: every page has one, even a group (it shows none), so changing
/// the type of an empty page never creates or drops a body.
pub async fn insert(tx: &mut sqlx::PgConnection, page: NewPage) -> Result<Page, sqlx::Error> {
    let inserted = sqlx::query_as::<_, Page>(
        "INSERT INTO pages
            (id, workspace_id, parent_id, position, type, title, icon, short_id, created_by,
             updated_by)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $9)
        RETURNING *",
    )
    .bind(page.id)
    .bind(page.workspace_id)
    .bind(page.parent_id)
    .bind(page.position)
    .bind(page.r#type)
    .bind(page.title)
    .bind(page.icon.map(Json))
    .bind(page.short_id)
    .bind(page.created_by)
    .fetch_one(&mut *tx)
    .await?;

    sqlx::query("INSERT INTO page_bodies (doc_id, doc_kind, workspace_id) VALUES ($1, 'page', $2)")
        .bind(inserted.id)
        .bind(inserted.workspace_id)
        .execute(&mut *tx)
        .await?;

    Ok(inserted)
}

/// A page's fields as `service::update_page` writes them.
pub struct PageFields<'a> {
    pub parent_id: Option<Uuid>,
    pub position: &'a str,
    pub r#type: PageType,
    pub title: &'a str,
    pub icon: Option<&'a PageIcon>,
    pub deleted_at: Option<DateTime<Utc>>,
    pub deleted_root: Option<Uuid>,
}

/// Writes the fields, bumps the version, sets who and when.
pub async fn update<'a>(
    executor: impl Executor<'a, Database = Postgres>,
    page_id: Uuid,
    fields: PageFields<'_>,
    actor_id: Uuid,
) -> Result<Page, sqlx::Error> {
    sqlx::query_as::<_, Page>(
        "UPDATE pages
        SET parent_id = $2, position = $3, type = $4, title = $5, icon = $6, deleted_at = $7,
            deleted_root = $8, version = version + 1, updated_by = $9,
            updated_at = CURRENT_TIMESTAMP
        WHERE id = $1
        RETURNING *",
    )
    .bind(page_id)
    .bind(fields.parent_id)
    .bind(fields.position)
    .bind(fields.r#type)
    .bind(fields.title)
    .bind(fields.icon.map(Json))
    .bind(fields.deleted_at)
    .bind(fields.deleted_root)
    .bind(actor_id)
    .fetch_one(executor)
    .await
}

/// Moves the live pages under `root` (not `root` itself: its own change goes through
/// `service::update_page`) to the trash with it: the same time, `root` as their `deleted_root`.
/// Pages trashed before, on their own, keep theirs.
pub async fn trash_descendants<'a>(
    executor: impl Executor<'a, Database = Postgres>,
    root: Uuid,
    at: DateTime<Utc>,
    actor_id: Uuid,
) -> Result<(), sqlx::Error> {
    sqlx::query(
        "WITH RECURSIVE down AS (
            SELECT id FROM pages WHERE parent_id = $1 AND deleted_at IS NULL
            UNION ALL
            SELECT p.id FROM pages p JOIN down ON p.parent_id = down.id
            WHERE p.deleted_at IS NULL
        )
        UPDATE pages
        SET deleted_at = $2, deleted_root = $1, version = version + 1, updated_by = $3,
            updated_at = $2
        WHERE id IN (SELECT id FROM down)",
    )
    .bind(root)
    .bind(at)
    .bind(actor_id)
    .execute(executor)
    .await
    .map(|_| ())
}

/// Brings back the pages trashed with `root` (not `root` itself, as in `trash_descendants`).
pub async fn restore_descendants<'a>(
    executor: impl Executor<'a, Database = Postgres>,
    root: Uuid,
    actor_id: Uuid,
) -> Result<(), sqlx::Error> {
    sqlx::query(
        "UPDATE pages
        SET deleted_at = NULL, deleted_root = NULL, version = version + 1, updated_by = $2,
            updated_at = CURRENT_TIMESTAMP
        WHERE deleted_root = $1 AND id <> $1",
    )
    .bind(root)
    .bind(actor_id)
    .execute(executor)
    .await
    .map(|_| ())
}

/// Locks the page's body until the transaction ends. socket_service writes the body's log with a
/// foreign key to it, which waits for this lock: nothing is written to the body meanwhile.
pub async fn lock_body<'a>(
    executor: impl Executor<'a, Database = Postgres>,
    page_id: Uuid,
) -> Result<(), sqlx::Error> {
    sqlx::query("SELECT 1 FROM page_bodies WHERE doc_id = $1 FOR UPDATE")
        .bind(page_id)
        .execute(executor)
        .await
        .map(|_| ())
}

/// Whether the page has anything in it: live children, or a body anyone ever wrote to. Its title
/// and icon do not count.
pub async fn has_content<'a>(
    executor: impl Executor<'a, Database = Postgres>,
    page_id: Uuid,
) -> Result<bool, sqlx::Error> {
    sqlx::query_scalar(
        "SELECT EXISTS (SELECT 1 FROM pages WHERE parent_id = $1 AND deleted_at IS NULL)
            OR EXISTS (SELECT 1 FROM page_bodies WHERE doc_id = $1 AND snapshot IS NOT NULL)
            OR EXISTS (SELECT 1 FROM page_body_updates WHERE doc_id = $1)",
    )
    .bind(page_id)
    .fetch_one(executor)
    .await
}
