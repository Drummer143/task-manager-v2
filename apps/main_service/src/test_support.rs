//! Fixtures shared by the database tests.

use sqlx::PgPool;
use uuid::Uuid;

/// Makes sure the workspace `id` exists, so rows that reference it can be written. Its slug comes
/// from the id, so several of them never collide.
pub async fn ensure_workspace(pool: &PgPool, id: Uuid) {
    sqlx::query(
        "INSERT INTO workspaces (id, name, slug, task_prefix)
         VALUES ($1, 'Test', 'ws-' || $1::text, 'TS')
         ON CONFLICT (id) DO NOTHING",
    )
    .bind(id)
    .execute(pool)
    .await
    .unwrap();
}
