//! Authentication between backend services.
//!
//! Internal endpoints (`/internal/*`) and calls from one service to another carry a shared secret
//! as a bearer token. It is deliberately independent of user authentication: a valid user token
//! never opens an internal endpoint, and `x-user-id`-style headers are only trusted behind this
//! guard.

use std::sync::Arc;

use axum::{
    extract::{Request, State},
    http::header,
    middleware::Next,
    response::{IntoResponse, Response},
};
use error_handlers::{ApiError, ErrorCode};
use subtle::ConstantTimeEq;

/// The secret that identifies a calling service.
#[derive(Clone)]
pub struct ServiceAuthState {
    token: Arc<String>,
}

impl ServiceAuthState {
    /// # Panics
    ///
    /// On an empty secret: an empty value would accept any request that sends an empty token, so
    /// a misconfigured service must fail at startup instead.
    pub fn new(token: impl Into<String>) -> Self {
        let token = token.into();
        assert!(
            !token.is_empty(),
            "the internal service token must not be empty"
        );
        Self {
            token: Arc::new(token),
        }
    }

    /// The secret, for authenticating this service's own outgoing calls
    /// (`request.bearer_auth(state.token())`).
    pub fn token(&self) -> &str {
        &self.token
    }

    fn accepts(&self, provided: &str) -> bool {
        provided.as_bytes().ct_eq(self.token.as_bytes()).into()
    }
}

/// Middleware for `axum::middleware::from_fn_with_state`: lets a request through only if it
/// carries the service secret as `Authorization: Bearer <secret>`.
pub async fn service_guard(
    State(state): State<ServiceAuthState>,
    req: Request,
    next: Next,
) -> Response {
    let provided = req
        .headers()
        .get(header::AUTHORIZATION)
        .and_then(|value| value.to_str().ok())
        .and_then(|value| value.strip_prefix("Bearer "));

    match provided {
        Some(token) if state.accepts(token) => next.run(req).await,
        _ => {
            tracing::debug!("internal request without a valid service token");
            ApiError::new(ErrorCode::Unauthorized).into_response()
        }
    }
}

#[cfg(test)]
mod tests {
    use axum::{
        Router,
        body::Body,
        http::{Request, StatusCode},
        middleware::from_fn_with_state,
        routing::get,
    };
    use tower::ServiceExt;

    use super::*;

    fn app() -> Router {
        Router::new()
            .route("/internal/ping", get(|| async { "pong" }))
            .layer(from_fn_with_state(
                ServiceAuthState::new("s3cret"),
                service_guard,
            ))
    }

    async fn status(authorization: Option<&str>) -> StatusCode {
        let mut request = Request::builder().uri("/internal/ping");
        if let Some(value) = authorization {
            request = request.header(header::AUTHORIZATION, value);
        }
        app()
            .oneshot(request.body(Body::empty()).unwrap())
            .await
            .unwrap()
            .status()
    }

    #[tokio::test]
    async fn the_right_secret_passes() {
        assert_eq!(status(Some("Bearer s3cret")).await, StatusCode::OK);
    }

    #[tokio::test]
    async fn everything_else_is_unauthorized() {
        for authorization in [
            None,
            Some("Bearer wrong"),
            Some("Bearer s3cre"),
            Some("Bearer s3cretX"),
            Some("Bearer "),
            Some("s3cret"),
            Some("Basic s3cret"),
        ] {
            assert_eq!(
                status(authorization).await,
                StatusCode::UNAUTHORIZED,
                "{authorization:?}"
            );
        }
    }

    #[test]
    #[should_panic(expected = "must not be empty")]
    fn an_empty_secret_is_rejected_at_startup() {
        ServiceAuthState::new("");
    }
}
