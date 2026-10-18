use axum::Router;
use axum::extract::FromRef;
use axum::middleware::from_fn_with_state;
use axum::routing::{get, patch, post};
use sqlx::PgPool;
use utils::auth_middleware::{InternalAuthState, auth_guard};

use crate::app_state::AppState;
use crate::signals::Signals;
use crate::workspaces::controllers::check_slug_available::check_slug_available;
use crate::workspaces::controllers::create::create_workspace;
use crate::workspaces::controllers::get_me_in_workspace::get_me_in_workspace;
use crate::workspaces::controllers::get_user_workspaces::get_user_workspaces;
use crate::workspaces::controllers::get_workspace_by_id::get_workspace_by_id;
use crate::workspaces::controllers::patch_workspace::patch_workspace;
use crate::workspaces::controllers::resolve_slug::resolve_slug;
use crate::workspaces::controllers::restore_workspace::restore_workspace;
use crate::workspaces::controllers::soft_delete_workspace::soft_delete_workspace;
use crate::workspaces::controllers::stats::get_stats;
use crate::workspaces::middleware::{load_workspace_context, load_workspace_context_with_deleted};

/// Workspaces, for signed-in users.
pub fn router(auth: InternalAuthState, state: AppState) -> Router<AppState> {
    Router::new()
        .route(
            "/workspaces",
            post(create_workspace).get(get_user_workspaces),
        )
        .route("/workspaces/resolve", get(resolve_slug))
        .route("/workspaces/slug-available", get(check_slug_available))
        .nest("/workspaces/{workspace_id}", workspace_routes(state))
        .layer(from_fn_with_state(auth, auth_guard))
}

/// The routes under `/workspaces/{workspace_id}`. Each gets the member's `WorkspaceContext`
/// from one of two layers, so a non-member always gets `404`:
/// - `load_workspace_context` — the default: a deleted workspace is `404` for everyone;
/// - `load_workspace_context_with_deleted` — only for what the owner needs on a deleted one
///   (reading it, restoring it, deleting it again).
///
/// Any state with a pool and signals will do: the tests run these routes as they are.
pub fn workspace_routes<S>(state: S) -> Router<S>
where
    S: Clone + Send + Sync + 'static,
    PgPool: FromRef<S>,
    Signals: FromRef<S>,
{
    let with_deleted = Router::new()
        .route("/", get(get_workspace_by_id).delete(soft_delete_workspace))
        .route("/restore", post(restore_workspace))
        .route_layer(from_fn_with_state(
            state.clone(),
            load_workspace_context_with_deleted,
        ));

    let live = Router::new()
        .route("/", patch(patch_workspace))
        .route("/me", get(get_me_in_workspace))
        .route("/stats", get(get_stats))
        .route_layer(from_fn_with_state(state, load_workspace_context));

    with_deleted.merge(live)
}
