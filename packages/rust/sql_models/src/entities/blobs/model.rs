use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use sqlx::prelude::FromRow;
use utoipa::ToSchema;
use uuid::Uuid;

#[derive(FromRow, Deserialize, Serialize, ToSchema)]
pub struct Blob {
    pub id: Uuid,
    pub hash: String,
    pub size: i64,
    pub path: String,
    pub mime_type: String,
    pub created_at: DateTime<Utc>,
}
