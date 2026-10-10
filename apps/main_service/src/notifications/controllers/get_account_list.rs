use axum::{Extension, Json, extract::State};
use error_handlers::ApiError;
use serde::Serialize;
use sql_models::notification::model::Notification;
use utoipa::ToSchema;
use uuid::Uuid;

use crate::notifications::repo::NotificationsRepository;

/// The Account group: few by nature, so one answer and no pages.
#[derive(Debug, Serialize, ToSchema)]
#[serde(rename_all = "camelCase")]
pub struct PinnedNotifications {
    pub data: Vec<Notification>,
}

/// The Account group pinned above every workspace's Inbox (spec: Inbox · 01): the unread
/// account-level notifications (an invite, a new sign-in), newest first. Shown in the Unread and
/// All tabs; once read, a notification leaves it for the workspace lists.
#[axum::debug_handler]
#[utoipa::path(
    get,
    path = "/notifications/account_pinned",
    operation_id = "listPinnedAccountNotifications",
    responses(
        (status = 200, description = "The pinned account-level notifications, newest first", body = PinnedNotifications),
        (status = 401, description = "Unauthorized"),
        (status = 500, description = "Internal server error")
    ),
    tag = "Notifications"
)]
pub async fn get_account_list(
    State(pool): State<sqlx::PgPool>,
    Extension(user_id): Extension<Uuid>,
) -> Result<Json<PinnedNotifications>, ApiError> {
    let data = NotificationsRepository::pinned_account(&pool, user_id).await?;

    Ok(Json(PinnedNotifications { data }))
}
