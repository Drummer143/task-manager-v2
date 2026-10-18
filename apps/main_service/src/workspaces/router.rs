use axum::Router;
use axum::middleware::from_fn_with_state;
use axum::routing::{get, patch, post};
use utils::auth_middleware::{InternalAuthState, auth_guard};

use crate::app_state::AppState;
use crate::workspaces::controllers::check_slug_available::check_slug_available;
use crate::workspaces::controllers::create::create_workspace;
use crate::workspaces::controllers::get_me_in_workspace::get_me_in_workspace;
use crate::workspaces::controllers::get_user_workspaces::get_user_workspaces;
use crate::workspaces::controllers::get_workspace_by_id::get_workspace_by_id;
use crate::workspaces::controllers::patch_workspace::patch_workspace;
use crate::workspaces::controllers::resolve_slug::resolve_slug;
use crate::workspaces::middleware::{load_workspace_context, load_workspace_context_with_deleted};

/// Workspaces, for signed-in users. Routes under `/workspaces/{workspace_id}` get the member's
/// `WorkspaceContext` from one of two layers, so a non-member always gets `404`:
/// - `load_workspace_context` — the default: a deleted workspace is `404` for everyone;
/// - `load_workspace_context_with_deleted` — only for what the owner needs on a deleted one
///   (reading it, restoring it).
pub fn router(auth: InternalAuthState, state: AppState) -> Router<AppState> {
    let with_deleted = Router::new()
        .route("/", get(get_workspace_by_id))
        .route_layer(from_fn_with_state(
            state.clone(),
            load_workspace_context_with_deleted,
        ));

    let live = Router::new()
        .route("/", patch(patch_workspace))
        .route("/me", get(get_me_in_workspace))
        .route_layer(from_fn_with_state(state, load_workspace_context));

    Router::new()
        .route(
            "/workspaces",
            post(create_workspace).get(get_user_workspaces),
        )
        .route("/workspaces/resolve", get(resolve_slug))
        .route("/workspaces/slug-available", get(check_slug_available))
        .nest("/workspaces/{workspace_id}", with_deleted.merge(live))
        .layer(from_fn_with_state(auth, auth_guard))
}
