//! What the frontend's queries are tagged with (`shared/realtime/tags.ts`), named in the `tags`
//! of `data.changed`.

use uuid::Uuid;

/// The user's list of workspaces.
pub const WORKSPACES: &str = "workspaces";

/// The workspace itself: its name, slug, prefix, icon.
pub fn workspace(workspace_id: Uuid) -> String {
    format!("workspace:{workspace_id}")
}
