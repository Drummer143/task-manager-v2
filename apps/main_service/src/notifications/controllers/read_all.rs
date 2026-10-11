use axum::{Extension, Json, extract::State};
use error_handlers::ApiError;
use serde::{Deserialize, Serialize};
use utoipa::ToSchema;
use uuid::Uuid;

use crate::notifications::{repo::NotificationsRepository, updates};
use crate::signals::Signals;
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
    State(signals): State<Signals>,
    Extension(user_id): Extension<Uuid>,
    Json(request): Json<ReadAllNotificationsRequest>,
) -> Result<Json<ReadAllNotificationsResponse>, ApiError> {
    workspaces::ensure_member(&pool, user_id, request.workspace).await?;

    let read_at = chrono::Utc::now();
    let affected = NotificationsRepository::mark_as_read_all(
        &pool,
        user_id,
        request.workspace,
        request.before,
        read_at,
    )
    .await?;

    // The rule, not the rows: the other tabs read what they have loaded the same way
    if !affected.is_empty() {
        let read_all = updates::ReadAllUpdate {
            workspace: request.workspace,
            before: request.before,
            read_at,
        };

        updates::publish(&pool, &signals, user_id, Vec::new(), Some(read_all)).await;
    }

    Ok(Json(ReadAllNotificationsResponse { affected }))
}
