use chrono::{DateTime, Utc};
use sql_models::user::model::User;
use sqlx::PgPool;
use uuid::Uuid;

/// A user as authentik describes it.
#[derive(Debug, Clone)]
pub struct AuthentikUserDto {
    pub id: Uuid,
    pub authentik_id: i32,
    pub username: String,
    pub email: Option<String>,
    pub is_active: bool,
    pub created_at: DateTime<Utc>,
}

pub struct UsersRepository;

impl UsersRepository {
    /// Creates the user, or updates the one with the same authentik pk.
    ///
    /// One statement for both cases, so a repeated delivery, or an update that arrives before the
    /// creation, ends in the same row. `id` and `created_at` never change once written.
    pub async fn upsert_from_authentik(
        pool: &PgPool,
        user: AuthentikUserDto,
    ) -> Result<User, sqlx::Error> {
        sqlx::query_as::<_, User>(
            "INSERT INTO users (id, authentik_id, username, email, is_active, created_at)
             VALUES ($1, $2, $3, $4, $5, $6)
             ON CONFLICT (authentik_id) DO UPDATE SET
                 username = EXCLUDED.username,
                 email = EXCLUDED.email,
                 is_active = EXCLUDED.is_active,
                 updated_at = CURRENT_TIMESTAMP
             RETURNING *",
        )
        .bind(user.id)
        .bind(user.authentik_id)
        .bind(user.username)
        .bind(user.email)
        .bind(user.is_active)
        .bind(user.created_at)
        .fetch_one(pool)
        .await
    }

    /// Whether a user was deleted; deleting an unknown pk is not an error.
    pub async fn delete_by_authentik_id(
        pool: &PgPool,
        authentik_id: i32,
    ) -> Result<bool, sqlx::Error> {
        let result = sqlx::query("DELETE FROM users WHERE authentik_id = $1")
            .bind(authentik_id)
            .execute(pool)
            .await?;
        Ok(result.rows_affected() > 0)
    }
}
