use axum::Router;
use axum::middleware::from_fn_with_state;
use axum::routing::post;
use utils::auth_middleware::{InternalAuthState, auth_guard};

use crate::app_state::AppState;
use crate::workspaces::controllers::create::create_workspace;

/// Workspaces, for signed-in users.
pub fn router(auth: InternalAuthState) -> Router<AppState> {
    Router::new()
        .route("/workspaces", post(create_workspace))
        .layer(from_fn_with_state(auth, auth_guard))
}
