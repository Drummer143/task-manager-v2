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

#[derive(serde::Deserialize)]
pub struct Claims {
    pub sub: Uuid,
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
}

#[cfg(feature = "test_auth_guard")]
pub async fn auth_guard(
    State(_state): State<InternalAuthState>,
    mut _req: Request<Body>,
    next: Next,
) -> Response<Body> {
    next.run(Request::new(Body::empty())).await
}

#[cfg(not(feature = "test_auth_guard"))]
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

    let token = match token_from_header {
        Some(t) => t,
        None => {
            let query = req.uri().query().unwrap_or("");
            let token_from_query = query.split('&').find_map(|pair| {
                let mut parts = pair.split('=');
                if parts.next() == Some("token") {
                    parts.next().map(|t| t.to_string())
                } else {
                    None
                }
            });

            match token_from_query {
                Some(t) => t,
                None => return unauthorized("missing or invalid Authorization header/query"),
            }
        }
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

    let token_data = match decode::<Claims>(&token, &decoding_key, &validation) {
        Ok(data) => data,
        Err(e) => return unauthorized(format_args!("invalid token: {:?}", e.kind())),
    };

    req.extensions_mut().insert(token_data.claims.sub);

    next.run(req).await
}

/// `401 UNAUTHORIZED`. The reason is for the log only: clients get the code, not the cause.
fn unauthorized(reason: impl std::fmt::Display) -> Response<Body> {
    tracing::debug!(%reason, "request is not authenticated");
    ApiError::new(ErrorCode::Unauthorized).into_response()
}
