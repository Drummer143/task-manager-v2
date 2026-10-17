use axum::Router;
use axum::middleware::from_fn_with_state;
use axum::routing::{get, post};
use utils::auth_middleware::{InternalAuthState, auth_guard};

use crate::app_state::AppState;
use crate::workspaces::controllers::create::create_workspace;
use crate::workspaces::controllers::get_user_workspaces::get_user_workspaces;
use crate::workspaces::controllers::get_workspace_by_id::get_workspace_by_id;
use crate::workspaces::middleware::load_workspace_context_with_deleted;

/// Workspaces, for signed-in users. Routes under `/workspaces/{workspace_id}` get the member's
/// `WorkspaceContext` from one of two layers, so a non-member always gets `404`:
/// - `load_workspace_context` — the default: a deleted workspace is `404` for everyone;
/// - `load_workspace_context_with_deleted` — only for what the owner needs on a deleted one
///   (reading it, restoring it).
pub fn router(auth: InternalAuthState, state: AppState) -> Router<AppState> {
    let workspace_id_router = Router::new()
        .route("/", get(get_workspace_by_id))
        .route_layer(from_fn_with_state(
            state,
            load_workspace_context_with_deleted,
        ));

    Router::new()
        .route(
            "/workspaces",
            post(create_workspace).get(get_user_workspaces),
        )
        .nest("/workspaces/{workspace_id}", workspace_id_router)
        .layer(from_fn_with_state(auth, auth_guard))
}
