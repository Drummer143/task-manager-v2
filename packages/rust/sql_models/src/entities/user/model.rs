use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use sqlx::FromRow;
use uuid::Uuid;

#[derive(Debug, Serialize, Deserialize, FromRow, utoipa::ToSchema, Clone)]
#[serde(rename_all = "camelCase")]
pub struct User {
    /// authentik's user uuid.
    pub id: Uuid,
    /// authentik's numeric user pk.
    pub authentik_id: i32,
    pub is_active: bool,
    pub username: String,

    #[serde(skip_serializing_if = "Option::is_none")]
    pub email: Option<String>,
    /// `None` until the user has an avatar.
    pub picture: Option<String>,

    pub created_at: DateTime<Utc>,
    pub updated_at: DateTime<Utc>,
}
