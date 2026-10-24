//! The `data.changed` signals of pages, to the workspace's channel: every member who has the
//! workspace open refetches what changed.

use uuid::Uuid;

use crate::{
    data_changed::{DATA_CHANGED, DataChanged},
    shared::tags,
    signals::Signals,
};

pub const PAGE_CREATED: &str = "page.created";
pub const PAGE_UPDATED: &str = "page.updated";
pub const PAGE_MOVED: &str = "page.moved";
pub const PAGE_DELETED: &str = "page.deleted";
pub const PAGE_RESTORED: &str = "page.restored";

/// The tree changed (`kind`: a page created, moved, deleted, restored): the sidebar and the
/// breadcrumbs, and the page itself.
pub async fn publish_tree_changed(
    signals: &Signals,
    workspace_id: Uuid,
    page_id: Uuid,
    kind: &'static str,
    origin: Option<Uuid>,
) {
    let signal = DataChanged {
        kind,
        tags: vec![tags::tree(workspace_id), tags::page(page_id)],
        origin,
    };

    signals
        .publish_to_workspace(workspace_id, DATA_CHANGED, &signal)
        .await;
}

/// The page's fields changed. The tree too when it draws them: the title, the icon, the type
/// (whose icon a page without its own shows).
pub async fn publish_updated(
    signals: &Signals,
    workspace_id: Uuid,
    page_id: Uuid,
    tree_changed: bool,
    origin: Option<Uuid>,
) {
    let mut changed = vec![tags::page(page_id)];
    if tree_changed {
        changed.push(tags::tree(workspace_id));
    }

    let signal = DataChanged {
        kind: PAGE_UPDATED,
        tags: changed,
        origin,
    };

    signals
        .publish_to_workspace(workspace_id, DATA_CHANGED, &signal)
        .await;
}
