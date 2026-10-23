//! The unread counts: what `GET /notifications/summary` answers and `inbox.updated` carries.

use std::collections::BTreeMap;

use serde::Serialize;
use utoipa::ToSchema;
use uuid::Uuid;

use crate::notifications::repo::NotificationsRepository;
use crate::workspaces::service as workspaces;

/// Unread counts (spec: Inbox · 09): the sidebar's Inbox shows `byWorkspace[current] +
/// accountUnread`, the workspace menu a dot where that sum is above zero.
#[derive(Debug, Default, Serialize, ToSchema)]
#[serde(rename_all = "camelCase")]
pub struct SummaryResponse {
    /// Unread in each workspace the user is a member of; a workspace with none is absent.
    by_workspace: BTreeMap<Uuid, i64>,
    /// Unread account-level notifications, shown in every workspace's Inbox.
    account_unread: i64,
}

/// The user's counts now.
pub async fn load_summary(
    pool: &sqlx::PgPool,
    user_id: Uuid,
) -> Result<SummaryResponse, sqlx::Error> {
    // A workspace the user has left is not counted (backend spec, notifications §8.2)
    let members = workspaces::member_workspace_ids(pool, user_id).await?;
    let counts = NotificationsRepository::count_unread(pool, user_id, Some(&members)).await?;

    Ok(SummaryResponse {
        by_workspace: counts.by_workspace.into_iter().collect(),
        account_unread: counts.account,
    })
}
