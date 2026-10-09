use axum::{Extension, Json, extract::State};
use error_handlers::ApiError;
use serde::Deserialize;
use utoipa::ToSchema;
use uuid::Uuid;

use crate::notifications::repo::NotificationsRepository;

#[derive(Deserialize, ToSchema)]
pub struct ReadNotificationRequest {
    ids: Vec<Uuid>,
}

#[utoipa::path(
    post,
    path = "/notifications/read",
    operation_id = "readNotification",
    request_body = ReadNotificationRequest,
    responses(
        (status = 200, description = "Notification marked as read"),
        (status = 400, description = "Invalid request"),
        (status = 401, description = "Unauthorized"),
        (status = 404, description = "No such notification of this user"),
        (status = 500, description = "Internal server error")
    ),
    tag = "Notifications"
)]
pub async fn read_notification(
    State(pool): State<sqlx::PgPool>,
    Extension(user_id): Extension<Uuid>,
    Json(body): Json<ReadNotificationRequest>,
) -> Result<(), ApiError> {
    NotificationsRepository::mark_as_read(&pool, user_id, body.ids).await?;
    Ok(())
}
