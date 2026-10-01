use axum::{
    Router,
    extract::DefaultBodyLimit,
    routing::{get, post},
};

use crate::{entities::files::controller, types::app_state::AppState};

/// Room for the maximum number of asset ids with plenty to spare.
const LINKS_BODY_LIMIT: usize = 64 * 1024;

pub fn init(state: AppState) -> Router<AppState> {
    // Only issuing links needs a signed-in user. Downloads are authorised by the link itself
    // (signature) or by the asset being public.
    let authenticated = Router::new()
        .route(
            "/files/links",
            post(controller::issue_links::issue_links).layer(DefaultBodyLimit::max(LINKS_BODY_LIMIT)),
        )
        .layer(axum::middleware::from_fn_with_state(
            state,
            utils::auth_middleware::auth_guard,
        ));

    Router::new()
        .route("/files/{asset_id}", get(controller::get_file::get_signed_file))
        .route(
            "/public/files/{asset_id}",
            get(controller::get_file::get_public_file),
        )
        .merge(authenticated)
}
