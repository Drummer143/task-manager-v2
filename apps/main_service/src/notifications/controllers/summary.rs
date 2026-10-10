use std::collections::BTreeMap;

use axum::{Extension, Json, extract::State};
use error_handlers::ApiError;
use serde::Serialize;
use utoipa::ToSchema;
use uuid::Uuid;

use crate::notifications::repo::NotificationsRepository;
use crate::workspaces;

/// Unread counts (spec: Inbox · 09): the sidebar's Inbox shows `byWorkspace[current] +
/// accountUnread`, the workspace menu a dot where that sum is above zero.
#[derive(Debug, Serialize, ToSchema)]
#[serde(rename_all = "camelCase")]
pub struct SummaryResponse {
    /// Unread in each workspace the user is a member of; a workspace with none is absent.
    by_workspace: BTreeMap<Uuid, i64>,
    /// Unread account-level notifications, shown in every workspace's Inbox.
    account_unread: i64,
}

#[utoipa::path(
    get,
    path = "/notifications/summary",
    operation_id = "getNotificationSummary",
    responses(
        (status = 200, description = "Notification summary", body = SummaryResponse),
        (status = 401, description = "Unauthorized"),
        (status = 500, description = "Internal server error")
    ),
    tag = "Notifications"
)]
pub async fn get_summary(
    State(pool): State<sqlx::PgPool>,
    Extension(user_id): Extension<Uuid>,
) -> Result<Json<SummaryResponse>, ApiError> {
    // A workspace the user has left is not counted (backend spec, notifications §8.2)
    let members = workspaces::member_workspace_ids(&pool, user_id).await?;
    let counts = NotificationsRepository::count_unread(&pool, user_id, members.as_deref()).await?;

    Ok(Json(SummaryResponse {
        by_workspace: counts.by_workspace.into_iter().collect(),
        account_unread: counts.account,
    }))
}
