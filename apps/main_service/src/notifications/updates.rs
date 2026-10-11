//! `inbox.updated`: what a change did to a user's Inbox, sent over the socket so their other tabs
//! and devices apply it without a refetch (Inbox spec 10). It carries the data, not a "refetch"
//! signal: the user's own topic may carry data (backend spec, notifications §5.3).

use chrono::{DateTime, Utc};
use serde::Serialize;
use sql_models::notification::model::Notification;
use utoipa::ToSchema;
use uuid::Uuid;

use crate::notifications::repo::NotificationsRepository;
use crate::notifications::summary::{SummaryResponse, load_summary};
use crate::signals::Signals;

/// The socket event's name.
pub const INBOX_UPDATED: &str = "inbox.updated";

/// What changed, and the counts after it.
#[derive(Debug, Serialize, ToSchema)]
#[serde(rename_all = "camelCase")]
pub struct InboxUpdated {
    /// Notifications as they are now: new, folded, or read / unread / archived / unarchived.
    #[serde(skip_serializing_if = "Vec::is_empty")]
    pub upserted: Vec<Notification>,
    /// A read-all: the client applies the same rule to what it has loaded.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub read_all: Option<ReadAllUpdate>,
    /// The unread counts after the change, to set as they are.
    pub summary: SummaryResponse,
}

/// A read-all, as `mark_as_read_all` applied it.
#[derive(Debug, Serialize, ToSchema)]
#[serde(rename_all = "camelCase")]
pub struct ReadAllUpdate {
    /// Its notifications and the account-level ones were read.
    pub workspace: Uuid,
    /// Those whose last event is not after this.
    pub before: DateTime<Utc>,
    /// The read time it wrote.
    pub read_at: DateTime<Utc>,
}

/// Sends `inbox.updated` to the user. Best effort, like every signal: a change that could not be
/// counted is logged and not sent; the next one carries the counts again.
pub async fn publish(
    pool: &sqlx::PgPool,
    signals: &Signals,
    user_id: Uuid,
    upserted: Vec<Notification>,
    read_all: Option<ReadAllUpdate>,
) {
    let summary = match load_summary(pool, user_id).await {
        Ok(summary) => summary,
        Err(error) => {
            tracing::warn!(%user_id, %error, "inbox.updated dropped: the summary failed");
            return;
        }
    };

    signals
        .publish(
            user_id,
            INBOX_UPDATED,
            &InboxUpdated {
                upserted,
                read_all,
                summary,
            },
        )
        .await;
}

/// Sends the notifications `ids` as they are after a change (read, unread, archive, unarchive).
/// The change is done already, so a failure here is logged, never the request's error.
pub async fn publish_changed(pool: &sqlx::PgPool, signals: &Signals, user_id: Uuid, ids: &[Uuid]) {
    match NotificationsRepository::get_many(pool, user_id, ids).await {
        Ok(changed) if !changed.is_empty() => publish(pool, signals, user_id, changed, None).await,
        Ok(_) => {}
        Err(error) => {
            tracing::warn!(%user_id, %error, "inbox.updated dropped: the changed rows failed")
        }
    }
}

/// Sends a read-all as its rule, not its rows: the other tabs read what they have loaded the same
/// way (`mark_as_read_all`).
pub async fn publish_read_all(
    pool: &sqlx::PgPool,
    signals: &Signals,
    user_id: Uuid,
    workspace: Uuid,
    before: DateTime<Utc>,
    read_at: DateTime<Utc>,
) {
    let read_all = ReadAllUpdate {
        workspace,
        before,
        read_at,
    };

    publish(pool, signals, user_id, Vec::new(), Some(read_all)).await;
}

#[cfg(test)]
mod tests {
    use serde_json::json;

    use super::*;

    // The frontend reads these keys (useInboxRealtime): camelCase, and a missing part is absent
    #[test]
    fn sends_camel_case_and_leaves_out_what_did_not_change() {
        let at = DateTime::from_timestamp(1_790_000_000, 0).unwrap();
        let update = InboxUpdated {
            upserted: Vec::new(),
            read_all: Some(ReadAllUpdate {
                workspace: Uuid::nil(),
                before: at,
                read_at: at,
            }),
            summary: SummaryResponse::default(),
        };

        assert_eq!(
            serde_json::to_value(update).unwrap(),
            json!({
                "readAll": {
                    "workspace": Uuid::nil(),
                    "before": at,
                    "readAt": at,
                },
                "summary": { "byWorkspace": {}, "accountUnread": 0 },
            })
        );
    }
}
