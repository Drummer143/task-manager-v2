use axum::{Extension, Json, extract::State};
use error_handlers::ApiError;
use serde::Deserialize;
use utoipa::ToSchema;
use uuid::Uuid;

use crate::notifications::repo::NotificationsRepository;

#[derive(Deserialize, ToSchema)]
pub struct UnarchiveNotificationRequest {
    id: Uuid,
}

#[utoipa::path(
    post,
    path = "/notifications/unarchive",
    operation_id = "unarchiveNotification",
    request_body = UnarchiveNotificationRequest,
    responses(
        (status = 200, description = "Notification unarchived"),
        (status = 400, description = "Invalid request"),
        (status = 401, description = "Unauthorized"),
        (status = 404, description = "No such notification of this user"),
        (status = 500, description = "Internal server error")
    )
)]
pub async fn unarchive_notification(
    State(pool): State<sqlx::PgPool>,
    Extension(user_id): Extension<Uuid>,
    Json(body): Json<UnarchiveNotificationRequest>,
) -> Result<(), ApiError> {
    NotificationsRepository::unarchive(&pool, user_id, body.id).await?;
    Ok(())
}
