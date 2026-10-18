//! The `data.changed` signals of workspaces.

use sqlx::PgPool;
use uuid::Uuid;

use crate::{
    data_changed::{DATA_CHANGED, DataChanged},
    shared::tags,
    signals::Signals,
    workspaces::repo,
};

pub const WORKSPACE_CREATED: &str = "workspace.created";
pub const WORKSPACE_UPDATED: &str = "workspace.updated";

/// A new workspace: the creator's other tabs add it to their list.
pub async fn publish_created(signals: &Signals, user_id: Uuid, origin: Option<Uuid>) {
    let signal = DataChanged {
        kind: WORKSPACE_CREATED,
        tags: vec![tags::WORKSPACES.to_owned()],
        origin,
    };

    signals.publish(user_id, DATA_CHANGED, &signal).await;
}

/// The workspace's own fields changed. Its channel gets the workspace; each member gets their
/// list, which shows it from inside the other workspaces too, where its channel is not joined.
pub async fn publish_updated(
    pool: &PgPool,
    signals: &Signals,
    workspace_id: Uuid,
    origin: Option<Uuid>,
) {
    let signal = DataChanged {
        kind: WORKSPACE_UPDATED,
        tags: vec![tags::workspace(workspace_id)],
        origin,
    };
    signals
        .publish_to_workspace(workspace_id, DATA_CHANGED, &signal)
        .await;

    let members = match repo::get_member_ids(pool, workspace_id).await {
        Ok(members) => members,
        Err(error) => {
            tracing::warn!(%workspace_id, %error, "workspace.updated not sent to the members");
            return;
        }
    };

    let signal = DataChanged {
        kind: WORKSPACE_UPDATED,
        tags: vec![tags::WORKSPACES.to_owned()],
        origin,
    };
    for user_id in members {
        signals.publish(user_id, DATA_CHANGED, &signal).await;
    }
}
