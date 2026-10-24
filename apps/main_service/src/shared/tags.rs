//! What the frontend's queries are tagged with (`shared/realtime/tags.ts`), named in the `tags`
//! of `data.changed`.

use uuid::Uuid;

/// The user's list of workspaces.
pub const WORKSPACES: &str = "workspaces";

/// The workspace itself: its name, slug, prefix, icon.
pub fn workspace(workspace_id: Uuid) -> String {
    format!("workspace:{workspace_id}")
}

/// The pages tree of a workspace: what is where, with titles, icons and types.
pub fn tree(workspace_id: Uuid) -> String {
    format!("tree:{workspace_id}")
}

/// One page: its title, icon, type, place.
pub fn page(page_id: Uuid) -> String {
    format!("page:{page_id}")
}
