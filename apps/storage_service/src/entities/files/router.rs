use axum::{Router, routing::get};

use crate::{entities::files::controller, types::app_state::AppState};

pub fn init(state: AppState) -> Router<AppState> {
    Router::new()
        .route(
            "/files/{asset_id}",
            get(controller::get_file::get_file),
        )
        .layer(axum::middleware::from_fn_with_state(
            state,
            utils::auth_middleware::auth_guard,
        ))
}
