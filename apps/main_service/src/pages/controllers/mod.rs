pub mod create_page;
pub mod delete_page;
pub mod get_page_by_short_id;
pub mod get_tree;
pub mod move_page;
pub mod patch_page;
pub mod restore_page;

use serde::Deserialize;
use uuid::Uuid;

/// `/workspaces/{workspace_id}/pages/{page_id}`: the workspace is the layer's.
#[derive(Deserialize)]
pub struct PagePath {
    pub page_id: Uuid,
}
