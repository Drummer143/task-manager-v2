use axum::{Router, extract::DefaultBodyLimit, routing::{delete, get, post}};

use crate::types::app_state::AppState;

pub fn init(state: AppState) -> Router<AppState> {
    Router::new()
        .route(
            "/actions/upload/{transaction_id}/status",
            get(super::controller::upload_status::upload_status),
        )
        .route(
            "/actions/upload/{transaction_id}/cancel",
            delete(super::controller::upload_cancel::upload_cancel),
        )
        .route(
            "/actions/upload/init",
            post(super::controller::upload_init::upload_init),
        )
        .route(
            "/actions/upload/{transaction_id}/whole-file",
            post(super::controller::upload_whole_file::upload_whole_file)
                .layer(DefaultBodyLimit::max(20 * 1024 * 1024)),
        )
        .route(
            "/actions/upload/{transaction_id}/chunk",
            post(super::controller::upload_chunk::upload_chunk)
                .layer(DefaultBodyLimit::max(10 * 1024 * 1024)),
        )
        .route(
            "/actions/upload/{transaction_id}/verify",
            post(super::controller::upload_verify::upload_verify)
                .layer(DefaultBodyLimit::max(50 * 1024 * 1024)),
        )
        .route(
            "/actions/upload/{transaction_id}/complete",
            post(super::controller::upload_complete::upload_complete),
        )
        .layer(axum::middleware::from_fn_with_state(
            state,
            utils::auth_middleware::auth_guard,
        ))
}
