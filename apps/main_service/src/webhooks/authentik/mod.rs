//! Webhooks from authentik, configured by `docker/authentik/blueprints`.

use axum::{Router, extract::FromRef, middleware::from_fn_with_state, routing::post};
use sqlx::PgPool;
use utils::service_auth::{ServiceAuthState, service_guard};

pub mod user_sync;

/// authentik sends `Authorization: Bearer <USER_SYNC_WEBHOOK_TOKEN>` (the blueprint's header
/// mapping); requests without it never reach the handlers.
pub fn router<S>(token: ServiceAuthState) -> Router<S>
where
    S: Clone + Send + Sync + 'static,
    PgPool: FromRef<S>,
{
    Router::new()
        .route("/webhooks/authentik/user_sync", post(user_sync::user_sync))
        .layer(from_fn_with_state(token, service_guard))
}
