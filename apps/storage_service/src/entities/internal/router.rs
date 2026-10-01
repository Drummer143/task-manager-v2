use axum::{Router, extract::DefaultBodyLimit, routing::post};

use crate::types::app_state::AppState;

pub fn init() -> Router<AppState> {
    Router::new()
        .route(
            "/internal/upload",
            post(super::controller::upload)
                .layer(DefaultBodyLimit::max(20 * 1024 * 1024)),
        )
}
