use sqlx::{Executor, Postgres, QueryBuilder};
use uuid::Uuid;

use crate::changes::dto::{Entity, FieldChange, FieldConflict};

/// The fields among `fields` changed after `base_version`, each with its latest change. Empty
/// when the client edited the current version, or only other fields changed since.
pub async fn conflicts<'a>(
    executor: impl Executor<'a, Database = Postgres>,
    entity: Entity,
    entity_id: Uuid,
    base_version: i64,
    fields: &[&str],
) -> Result<Vec<FieldConflict>, sqlx::Error> {
    sqlx::query_as::<_, FieldConflict>(
        "SELECT DISTINCT ON (field) field, actor_id, at
        FROM field_changes
        WHERE entity_type = $1
            AND entity_id = $2
            AND version > $3
            AND field = ANY($4)
        ORDER BY field, version DESC
        ",
    )
    .bind(entity)
    .bind(entity_id)
    .bind(base_version)
    .bind(fields)
    .fetch_all(executor)
    .await
}

/// Writes the changes that produced `version` of the entity. Nothing to write is fine.
pub async fn record<'a>(
    executor: impl Executor<'a, Database = Postgres>,
    entity: Entity,
    entity_id: Uuid,
    version: i64,
    actor_id: Uuid,
    workspace_id: Option<Uuid>,
    changes: &[FieldChange],
) -> Result<(), sqlx::Error> {
    if changes.is_empty() {
        return Ok(());
    }

    let mut query = QueryBuilder::<Postgres>::new(
        "INSERT INTO field_changes
            (entity_type, entity_id, version, field, old_value, new_value, actor_id, workspace_id) ",
    );
    query.push_values(changes, |mut row, change| {
        row.push_bind(entity)
            .push_bind(entity_id)
            .push_bind(version)
            .push_bind(change.field)
            .push_bind(sqlx::types::Json(&change.old))
            .push_bind(sqlx::types::Json(&change.new))
            .push_bind(actor_id)
            .push_bind(workspace_id);
    });

    query.build().execute(executor).await.map(|_| ())
}

// Needs a disposable Postgres; `#[sqlx::test]` creates a fresh database per test there:
//   DATABASE_URL=postgres://test:test@127.0.0.1:55432/postgres cargo test -p main_service -- --ignored
// Never point it at a shared database.
#[cfg(test)]
mod tests {
    use serde_json::json;
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

    fn change(field: &'static str, old: &str, new: &str) -> FieldChange {
        FieldChange {
            field,
            old: json!(old),
            new: json!(new),
        }
    }

    async fn conflicting(pool: &PgPool, id: Uuid, base: i64, fields: &[&str]) -> Vec<String> {
        conflicts(pool, Entity::Workspace, id, base, fields)
            .await
            .unwrap()
            .into_iter()
            .map(|c| c.field)
            .collect()
    }

    #[sqlx::test(migrations = "./migrations")]
    #[ignore = "needs DATABASE_URL to a disposable Postgres"]
    async fn records_one_row_per_field_with_both_values(pool: PgPool) {
        let actor = user(&pool).await;
        let workspace = Uuid::now_v7();
        crate::test_support::ensure_workspace(&pool, workspace).await;

        record(
            &pool,
            Entity::Workspace,
            workspace,
            2,
            actor,
            Some(workspace),
            &[
                change("name", "Verso team", "Verso Labs"),
                change("slug", "verso-team", "verso-labs"),
            ],
        )
        .await
        .unwrap();

        let rows: Vec<(
            String,
            i64,
            serde_json::Value,
            serde_json::Value,
            Option<Uuid>,
        )> = sqlx::query_as(
            "SELECT field, version, old_value, new_value, actor_id
                 FROM field_changes WHERE entity_type = 'workspace' AND entity_id = $1
                 ORDER BY field",
        )
        .bind(workspace)
        .fetch_all(&pool)
        .await
        .unwrap();

        assert_eq!(
            rows,
            [
                (
                    "name".to_string(),
                    2,
                    json!("Verso team"),
                    json!("Verso Labs"),
                    Some(actor)
                ),
                (
                    "slug".to_string(),
                    2,
                    json!("verso-team"),
                    json!("verso-labs"),
                    Some(actor)
                ),
            ]
        );
    }

    #[sqlx::test(migrations = "./migrations")]
    #[ignore = "needs DATABASE_URL to a disposable Postgres"]
    async fn nothing_to_record_writes_nothing(pool: PgPool) {
        let actor = user(&pool).await;

        record(&pool, Entity::Role, Uuid::now_v7(), 2, actor, None, &[])
            .await
            .unwrap();

        let count: i64 = sqlx::query_scalar("SELECT count(*) FROM field_changes")
            .fetch_one(&pool)
            .await
            .unwrap();
        assert_eq!(count, 0);
    }

    #[sqlx::test(migrations = "./migrations")]
    #[ignore = "needs DATABASE_URL to a disposable Postgres"]
    async fn a_conflict_is_a_field_changed_after_the_base_version(pool: PgPool) {
        let actor = user(&pool).await;
        let id = Uuid::now_v7();
        // version 2 changed the name, version 3 the slug
        record(
            &pool,
            Entity::Workspace,
            id,
            2,
            actor,
            None,
            &[change("name", "a", "b")],
        )
        .await
        .unwrap();
        record(
            &pool,
            Entity::Workspace,
            id,
            3,
            actor,
            None,
            &[change("slug", "x", "y")],
        )
        .await
        .unwrap();

        // Edited version 1: both were changed since
        assert_eq!(
            conflicting(&pool, id, 1, &["name", "slug"]).await,
            ["name", "slug"]
        );
        // Edited version 2: only the slug changed since
        assert_eq!(conflicting(&pool, id, 2, &["name", "slug"]).await, ["slug"]);
        // Edited version 1 but sends only the task prefix: nothing of it changed
        assert!(conflicting(&pool, id, 1, &["taskPrefix"]).await.is_empty());
        // Edited the current version
        assert!(
            conflicting(&pool, id, 3, &["name", "slug"])
                .await
                .is_empty()
        );
    }

    #[sqlx::test(migrations = "./migrations")]
    #[ignore = "needs DATABASE_URL to a disposable Postgres"]
    async fn a_conflict_names_the_latest_change_of_the_field(pool: PgPool) {
        let (first, second) = (user(&pool).await, user(&pool).await);
        let id = Uuid::now_v7();
        record(
            &pool,
            Entity::Workspace,
            id,
            2,
            first,
            None,
            &[change("name", "a", "b")],
        )
        .await
        .unwrap();
        record(
            &pool,
            Entity::Workspace,
            id,
            3,
            second,
            None,
            &[change("name", "b", "c")],
        )
        .await
        .unwrap();

        let found = conflicts(&pool, Entity::Workspace, id, 1, &["name"])
            .await
            .unwrap();

        assert_eq!(found.len(), 1);
        assert_eq!(found[0].by, Some(second));
    }

    #[sqlx::test(migrations = "./migrations")]
    #[ignore = "needs DATABASE_URL to a disposable Postgres"]
    async fn entities_of_different_types_do_not_mix(pool: PgPool) {
        let actor = user(&pool).await;
        let id = Uuid::now_v7();
        record(
            &pool,
            Entity::Role,
            id,
            2,
            actor,
            None,
            &[change("name", "a", "b")],
        )
        .await
        .unwrap();

        assert!(conflicting(&pool, id, 1, &["name"]).await.is_empty());
    }

    #[sqlx::test(migrations = "./migrations")]
    #[ignore = "needs DATABASE_URL to a disposable Postgres"]
    async fn the_history_goes_with_its_workspace_and_outlives_its_actor(pool: PgPool) {
        let actor = user(&pool).await;
        let (kept, erased) = (Uuid::now_v7(), Uuid::now_v7());
        for workspace in [kept, erased] {
            crate::test_support::ensure_workspace(&pool, workspace).await;
            record(
                &pool,
                Entity::Workspace,
                workspace,
                2,
                actor,
                Some(workspace),
                &[change("name", "a", "b")],
            )
            .await
            .unwrap();
        }

        sqlx::query("DELETE FROM workspaces WHERE id = $1")
            .bind(erased)
            .execute(&pool)
            .await
            .unwrap();
        sqlx::query("DELETE FROM users WHERE id = $1")
            .bind(actor)
            .execute(&pool)
            .await
            .unwrap();

        let left: Vec<(Uuid, Option<Uuid>)> =
            sqlx::query_as("SELECT entity_id, actor_id FROM field_changes")
                .fetch_all(&pool)
                .await
                .unwrap();
        assert_eq!(left, [(kept, None)]);
    }
}
