use axum::{Router, extract::DefaultBodyLimit, routing::post};

use crate::types::app_state::AppState;

/// Endpoints for other backend services only. They are guarded by the service token, so a user
/// token never opens them; the gateway should not route `/internal/*` to the internet either.
pub fn init(state: AppState) -> Router<AppState> {
    Router::new()
        .route(
            "/internal/upload",
            post(super::controller::upload).layer(DefaultBodyLimit::max(20 * 1024 * 1024)),
        )
        .layer(axum::middleware::from_fn_with_state(
            state,
            utils::service_auth::service_guard,
        ))
}
