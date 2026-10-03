use std::sync::Arc;

use axum::{
    body::Body,
    extract::State,
    http::{Request, header},
    middleware::Next,
    response::{IntoResponse, Response},
};
use error_handlers::{ApiError, ErrorCode};
use jsonwebtoken::{Algorithm, DecodingKey, Validation, decode, decode_header};
use tokio::sync::RwLock;
use uuid::Uuid;

use crate::types::jwks::JwkSet;

/// What handlers can read from a verified access token: `Extension<Claims>` (and the user id
/// alone as `Extension<Uuid>`).
#[derive(Debug, Clone, serde::Deserialize)]
pub struct Claims {
    /// authentik's user uuid (`sub_mode: user_uuid`).
    pub sub: Uuid,
    #[serde(default)]
    pub email: Option<String>,
    #[serde(default)]
    pub preferred_username: Option<String>,
    #[serde(default)]
    pub name: Option<String>,
}

pub async fn fetch_jwks(url: &str) -> Result<JwkSet, String> {
    reqwest::get(url)
        .await
        .map_err(|e| e.to_string())?
        .json::<JwkSet>()
        .await
        .map_err(|e| e.to_string())
}

#[derive(Clone)]
pub struct InternalAuthState {
    pub jwks: Arc<RwLock<JwkSet>>,
    pub authentik_jwks_url: Arc<String>,
    pub authentik_audience: Arc<String>,
    /// The expected `iss`, e.g. `https://auth.example.com/application/o/task-manager/`. When set,
    /// tokens of other authentik applications are refused even if they share the signing key.
    pub authentik_issuer: Option<Arc<String>>,
}

pub async fn auth_guard(
    State(state): State<InternalAuthState>,
    mut req: Request<Body>,
    next: Next,
) -> Response<Body> {
    let token_from_header = req
        .headers()
        .get(header::AUTHORIZATION)
        .and_then(|h| h.to_str().ok())
        .and_then(|h| h.strip_prefix("Bearer "))
        .map(|t| t.to_string());

    // Only the `Authorization` header is accepted: a token in the URL ends up in access logs,
    // browser history and `Referer`. Browsers fetch files through signed links instead.
    let Some(token) = token_from_header else {
        return unauthorized("missing or invalid Authorization header");
    };

    let header = match decode_header(&token) {
        Ok(h) => h,
        Err(_) => return unauthorized("invalid token structure"),
    };
    let kid = header.kid.unwrap_or_default();

    let jwk = {
        let read_lock = state.jwks.read().await;
        let key = read_lock.keys.iter().find(|k| k.kid == kid).cloned();
        drop(read_lock);

        match key {
            Some(k) => k,
            None => match fetch_jwks(&state.authentik_jwks_url).await {
                Ok(new_jwks) => {
                    let mut write_lock = state.jwks.write().await;
                    *write_lock = new_jwks.clone();
                    match new_jwks.keys.iter().find(|k| k.kid == kid).cloned() {
                        Some(k) => k,
                        None => return unauthorized("key not found even after refresh"),
                    }
                }
                Err(_) => return unauthorized("auth service unreachable"),
            },
        }
    };

    let decoding_key = match DecodingKey::from_rsa_components(&jwk.n, &jwk.e) {
        Ok(key) => key,
        Err(_) => return unauthorized("unusable signing key"),
    };

    let mut validation = Validation::new(Algorithm::RS256);
    validation.leeway = 60;
    validation.set_audience(&[&state.authentik_audience]);
    if let Some(issuer) = &state.authentik_issuer {
        validation.set_issuer(&[issuer.as_str()]);
    }

    let token_data = match decode::<Claims>(&token, &decoding_key, &validation) {
        Ok(data) => data,
        Err(e) => return unauthorized(format_args!("invalid token: {:?}", e.kind())),
    };

    req.extensions_mut().insert(token_data.claims.sub);
    req.extensions_mut().insert(token_data.claims);

    next.run(req).await
}

/// `401 UNAUTHORIZED`. The reason is for the log only: clients get the code, not the cause.
fn unauthorized(reason: impl std::fmt::Display) -> Response<Body> {
    tracing::debug!(%reason, "request is not authenticated");
    ApiError::new(ErrorCode::Unauthorized).into_response()
}

#[cfg(test)]
mod tests {
    use axum::{
        Router, body::Body, http::StatusCode, middleware::from_fn_with_state, routing::get,
    };
    use tower::ServiceExt;

    use super::*;

    fn app() -> Router {
        let state = InternalAuthState {
            jwks: Arc::new(RwLock::new(JwkSet { keys: Vec::new() })),
            authentik_jwks_url: Arc::new("http://127.0.0.1:1/jwks".into()),
            authentik_audience: Arc::new("test".into()),
            authentik_issuer: None,
        };
        Router::new()
            .route("/protected", get(|| async { "ok" }))
            .layer(from_fn_with_state(state, auth_guard))
    }

    async fn status(uri: &str, authorization: Option<&str>) -> StatusCode {
        let mut request = Request::builder().uri(uri);
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
    async fn a_request_without_credentials_is_unauthorized() {
        assert_eq!(status("/protected", None).await, StatusCode::UNAUTHORIZED);
    }

    #[tokio::test]
    async fn a_token_in_the_query_string_is_not_accepted() {
        // Tokens in URLs leak through logs and `Referer`; only the header counts.
        assert_eq!(
            status("/protected?token=eyJhbGciOiJSUzI1NiJ9.e30.c2ln", None).await,
            StatusCode::UNAUTHORIZED
        );
    }

    #[tokio::test]
    async fn malformed_credentials_are_unauthorized() {
        for authorization in ["Bearer not-a-jwt", "Basic dXNlcjpwYXNz", "Bearer"] {
            assert_eq!(
                status("/protected", Some(authorization)).await,
                StatusCode::UNAUTHORIZED,
                "{authorization}"
            );
        }
    }
}
