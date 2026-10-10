use axum::{Extension, Json, extract::State};
use error_handlers::ApiError;
use serde::{Deserialize, Serialize};
use utoipa::ToSchema;
use uuid::Uuid;

use crate::notifications::repo::NotificationsRepository;
use crate::workspaces;

#[derive(Deserialize, ToSchema)]
pub struct ReadAllNotificationsRequest {
    /// The workspace whose Inbox is read: the others and the account-level ones stay unread.
    workspace: Uuid,
    /// `updatedAt` of the newest notification the user saw: what came later stays unread.
    before: chrono::DateTime<chrono::Utc>,
}

#[derive(Serialize, ToSchema)]
pub struct ReadAllNotificationsResponse {
    affected: Vec<Uuid>,
}

#[utoipa::path(
    post,
    path = "/notifications/read_all",
    operation_id = "readAllNotifications",
    request_body = ReadAllNotificationsRequest,
    responses(
        (status = 200, description = "All notifications marked as read", body = ReadAllNotificationsResponse),
        (status = 400, description = "Invalid request"),
        (status = 401, description = "Unauthorized"),
        (status = 404, description = "No such workspace for this user"),
        (status = 500, description = "Internal server error")
    ),
    tag = "Notifications"
)]
pub async fn read_all_notifications(
    State(pool): State<sqlx::PgPool>,
    Extension(user_id): Extension<Uuid>,
    Json(request): Json<ReadAllNotificationsRequest>,
) -> Result<Json<ReadAllNotificationsResponse>, ApiError> {
    workspaces::ensure_member(&pool, user_id, request.workspace).await?;

    NotificationsRepository::mark_as_read_all(&pool, user_id, request.workspace, request.before)
        .await
        .map(|affected| Json(ReadAllNotificationsResponse { affected }))
        .map_err(ApiError::from)
}
