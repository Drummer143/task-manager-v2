use axum::{Extension, Json, extract::State};
use error_handlers::ApiError;
use serde::Deserialize;
use utoipa::ToSchema;
use uuid::Uuid;

use crate::notifications::repo::NotificationsRepository;

#[derive(Deserialize, ToSchema)]
pub struct UnreadNotificationRequest {
    id: Uuid,
}

#[utoipa::path(
    post,
    path = "/notifications/unread",
    operation_id = "unreadNotification",
    request_body = UnreadNotificationRequest,
    responses(
        (status = 200, description = "Notification marked as unread"),
        (status = 400, description = "Invalid request"),
        (status = 401, description = "Unauthorized"),
        (status = 404, description = "No such notification of this user"),
        (status = 500, description = "Internal server error")
    ),
    tag = "Notifications"
)]
pub async fn unread_notification(
    State(pool): State<sqlx::PgPool>,
    Extension(user_id): Extension<Uuid>,
    Json(body): Json<UnreadNotificationRequest>,
) -> Result<(), ApiError> {
    NotificationsRepository::mark_as_unread(&pool, user_id, body.id).await?;
    Ok(())
}
