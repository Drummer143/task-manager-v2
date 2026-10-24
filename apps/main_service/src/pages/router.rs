use axum::{
    Router,
    extract::FromRef,
    routing::{get, patch, post},
};
use sqlx::PgPool;

use crate::{
    pages::controllers::{
        create_page::create_page, delete_page::delete_page,
        get_page_by_short_id::get_page_by_short_id, get_tree::get_tree, move_page::move_page,
        patch_page::patch_page, restore_page::restore_page,
    },
    signals::Signals,
};

/// The routes under `/workspaces/{workspace_id}/pages`. They need the member's `WorkspaceContext`:
/// `workspaces::router` nests them under its layer for a live workspace.
pub fn routes<S>() -> Router<S>
where
    S: Clone + Send + Sync + 'static,
    PgPool: FromRef<S>,
    Signals: FromRef<S>,
{
    Router::new()
        .route("/", get(get_tree).post(create_page))
        .route("/by-short/{short_id}", get(get_page_by_short_id))
        .route("/{page_id}", patch(patch_page).delete(delete_page))
        .route("/{page_id}/move", post(move_page))
        .route("/{page_id}/restore", post(restore_page))
}
