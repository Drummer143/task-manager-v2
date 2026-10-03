use axum::{Json, extract::State};
use error_handlers::{ApiError, ErrorCode, FieldError};
use sql_models::notification::model::Notification;

use crate::notifications::repo::{CreateNotificationDto, NotificationsRepository};
use crate::signals::Signals;

#[utoipa::path(
    post,
    path = "/notifications",
    operation_id = "createNotification",
    request_body = CreateNotificationDto,
    responses(
        (status = 200, description = "Notification created", body = Notification),
        (status = 400, description = "Bad request"),
        (status = 401, description = "Unauthorized"),
        (status = 422, description = "No user with this userId"),
        (status = 500, description = "Internal server error")
    )
)]
pub async fn create(
    State(pool): State<sqlx::PgPool>,
    State(signals): State<Signals>,
    Json(body): Json<CreateNotificationDto>,
) -> Result<Json<Notification>, ApiError> {
    let notification =
        NotificationsRepository::create(&pool, body)
            .await
            .map_err(|err| match &err {
                // notifications.user_id references users
                sqlx::Error::Database(db) if db.is_foreign_key_violation() => {
                    ApiError::validation(vec![FieldError::new("userId", ErrorCode::NotFound)])
                        .with_source(err)
                }
                _ => ApiError::from(err),
            })?;

    signals
        .publish(notification.user_id, "new_notification", &notification)
        .await;

    Ok(Json(notification))
}
