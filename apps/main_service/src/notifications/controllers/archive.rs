use axum::{Extension, Json, extract::State};
use error_handlers::ApiError;
use serde::Deserialize;
use utoipa::ToSchema;
use uuid::Uuid;

use crate::notifications::repo::NotificationsRepository;

#[derive(Deserialize, ToSchema)]
pub struct ArchiveNotificationRequest {
    id: Uuid,
}

#[utoipa::path(
    post,
    path = "/notifications/archive",
    operation_id = "archiveNotification",
    request_body = ArchiveNotificationRequest,
    responses(
        (status = 200, description = "Notification archived"),
        (status = 400, description = "Invalid request"),
        (status = 401, description = "Unauthorized"),
        (status = 404, description = "No such notification of this user"),
        (status = 500, description = "Internal server error")
    )
)]
pub async fn archive_notification(
    State(pool): State<sqlx::PgPool>,
    Extension(user_id): Extension<Uuid>,
    Json(body): Json<ArchiveNotificationRequest>,
) -> Result<(), ApiError> {
    NotificationsRepository::archive(&pool, user_id, body.id).await?;
    Ok(())
}
