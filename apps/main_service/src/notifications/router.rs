use axum::Router;
use axum::middleware::from_fn_with_state;
use axum::routing::{get, post};
use utils::auth_middleware::{InternalAuthState, auth_guard};

use crate::app_state::AppState;
use crate::notifications::controllers::read_all::read_all_notifications;
use crate::notifications::controllers::{
    archive::archive_notification, create::create, get_account_list::get_account_list,
    get_list::get_list, read::read_notification, summary::get_summary,
    unarchive::unarchive_notification, unread::unread_notification,
};

/// `debug_create` mounts `POST /notifications` (config `DEBUG_NOTIFICATIONS`): it lets any
/// signed-in user notify anyone, so it exists only to test the pipeline.
pub fn router(auth: InternalAuthState, debug_create: bool) -> Router<AppState> {
    let list = if debug_create {
        get(get_list).post(create)
    } else {
        get(get_list)
    };

    Router::new()
        .route("/notifications", list)
        .route("/notifications/account_pinned", get(get_account_list))
        .route("/notifications/summary", get(get_summary))
        .route("/notifications/read", post(read_notification))
        .route("/notifications/read_all", post(read_all_notifications))
        .route("/notifications/unread", post(unread_notification))
        .route("/notifications/archive", post(archive_notification))
        .route("/notifications/unarchive", post(unarchive_notification))
        .layer(from_fn_with_state(auth, auth_guard))
}

#[cfg(test)]
mod tests {
    use std::sync::Arc;

    use tokio::sync::RwLock;
    use utils::types::jwks::JwkSet;

    use super::*;

    fn auth() -> InternalAuthState {
        InternalAuthState {
            jwks: Arc::new(RwLock::new(JwkSet { keys: Vec::new() })),
            authentik_jwks_url: Arc::new("http://127.0.0.1:1/jwks".into()),
            authentik_audience: Arc::new("client".into()),
            authentik_issuer: None,
        }
    }

    // Axum checks paths when a route is added and panics on a bad one: building the router
    // is enough to catch it, in both shapes
    #[test]
    fn builds_with_and_without_the_debug_endpoint() {
        let _ = router(auth(), false);
        let _ = router(auth(), true);
    }
}
