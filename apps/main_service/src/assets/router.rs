use axum::{Router, middleware::from_fn_with_state, routing::post};
use utils::{
    auth_middleware::{InternalAuthState, auth_guard},
    service_auth::{ServiceAuthState, service_guard},
};

use crate::app_state::AppState;
use crate::assets::controllers::{
    access::readable_assets, check_blobs::check_blobs, complete::complete_upload,
    create::create_asset,
};

/// `POST /assets` for signed-in users; `/internal/assets/*` for storage, which authenticates with
/// the service token (`INTERNAL_SERVICE_TOKEN`). The proxy keeps `/internal` off the internet.
pub fn router(auth: InternalAuthState, service: ServiceAuthState) -> Router<AppState> {
    let public = Router::new()
        .route("/assets", post(create_asset))
        .layer(from_fn_with_state(auth, auth_guard));

    let internal = Router::new()
        .route("/internal/assets/complete", post(complete_upload))
        .route("/internal/assets/access", post(readable_assets))
        .route("/internal/assets/check-blobs", post(check_blobs))
        .layer(from_fn_with_state(service, service_guard));

    public.merge(internal)
}

#[cfg(test)]
mod tests {
    use std::sync::Arc;

    use tokio::sync::RwLock;
    use utils::types::jwks::JwkSet;

    use super::*;

    // Axum checks paths when a route is added and panics on a bad one
    #[test]
    fn builds() {
        let auth = InternalAuthState {
            jwks: Arc::new(RwLock::new(JwkSet { keys: Vec::new() })),
            authentik_jwks_url: Arc::new("http://127.0.0.1:1/jwks".into()),
            authentik_audience: Arc::new("client".into()),
            authentik_issuer: None,
        };

        let _ = router(auth, ServiceAuthState::new("token"));
    }
}
