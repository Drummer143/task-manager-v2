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

/// A user as an access token describes it: no authentik pk, no activity flag.
#[derive(Debug, Clone)]
pub struct TokenUserDto {
    pub id: Uuid,
    pub username: String,
    pub email: Option<String>,
}

pub struct UsersRepository;

impl UsersRepository {
    /// Creates the user, or updates the one with the same id (authentik's uuid).
    ///
    /// One statement for both cases, so a repeated delivery, an update that arrives before the
    /// creation, or a row `GET /me` created first all end in the same row. `created_at` never
    /// changes once written.
    pub async fn upsert_from_authentik(
        pool: &PgPool,
        user: AuthentikUserDto,
    ) -> Result<User, sqlx::Error> {
        sqlx::query_as::<_, User>(
            "INSERT INTO users (id, authentik_id, username, email, is_active, created_at)
             VALUES ($1, $2, $3, $4, $5, $6)
             ON CONFLICT (id) DO UPDATE SET
                 authentik_id = EXCLUDED.authentik_id,
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

    /// The user, created from the token on the first request if authentik's webhook has not
    /// arrived yet. An existing row is returned as it is: the webhook is the source of truth.
    pub async fn get_or_create_from_token(
        pool: &PgPool,
        user: TokenUserDto,
    ) -> Result<User, sqlx::Error> {
        sqlx::query_as::<_, User>(
            "WITH created AS (
                 INSERT INTO users (id, username, email) VALUES ($1, $2, $3)
                 ON CONFLICT (id) DO NOTHING
                 RETURNING *
             )
             SELECT * FROM created
             UNION ALL
             SELECT * FROM users WHERE id = $1
             LIMIT 1",
        )
        .bind(user.id)
        .bind(user.username)
        .bind(user.email)
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
