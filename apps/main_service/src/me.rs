//! `GET /me`: who the signed-in user is and whether they may use the app.
//!
//! The frontend calls it right after signing in. A valid authentik token alone does not let
//! anyone in: this is where the user is created and the app's own rules are applied.

use axum::extract::{FromRef, State};
use axum::{Extension, Json, Router, middleware::from_fn_with_state, routing::get};
use error_handlers::{ApiError, ErrorCode};
use serde::Serialize;
use sql_models::user::model::User;
use sqlx::PgPool;
use utils::auth_middleware::{Claims, InternalAuthState, auth_guard};
use utoipa::ToSchema;

use crate::repos::users::{TokenUserDto, UsersRepository};

#[derive(Debug, Serialize, ToSchema)]
#[serde(rename_all = "camelCase")]
pub struct MeResponse {
    pub user: User,
    /// Workspaces the user is a member of; there are none until workspaces exist.
    #[schema(value_type = Vec<Object>)]
    pub workspaces: Vec<serde_json::Value>,
    /// Invitations waiting for the user's email.
    #[schema(value_type = Vec<Object>)]
    pub pending_invites: Vec<serde_json::Value>,
}

pub fn router<S>(auth: InternalAuthState) -> Router<S>
where
    S: Clone + Send + Sync + 'static,
    PgPool: FromRef<S>,
{
    Router::new()
        .route("/me", get(me))
        .layer(from_fn_with_state(auth, auth_guard))
}

#[utoipa::path(
    get,
    path = "/me",
    operation_id = "getMe",
    responses(
        (status = 200, description = "The signed-in user", body = MeResponse),
        (status = 401, description = "Unauthorized"),
        (status = 403, description = "The user is deactivated"),
        (status = 500, description = "Internal server error")
    )
)]
pub async fn me(
    State(pool): State<PgPool>,
    Extension(claims): Extension<Claims>,
) -> Result<Json<MeResponse>, ApiError> {
    let user = UsersRepository::get_or_create_from_token(&pool, token_user(claims)).await?;

    // Deactivated in authentik (synced by the webhook): the token may still be valid for minutes
    if !user.is_active {
        return Err(ApiError::new(ErrorCode::Forbidden).with_source("the user is deactivated"));
    }

    Ok(Json(MeResponse {
        user,
        workspaces: Vec::new(),
        pending_invites: Vec::new(),
    }))
}

/// The best name the token offers; the webhook replaces it with authentik's username later.
fn token_user(claims: Claims) -> TokenUserDto {
    let username = claims
        .preferred_username
        .clone()
        .or_else(|| claims.name.clone())
        .or_else(|| claims.email.clone())
        .unwrap_or_else(|| claims.sub.to_string());
    TokenUserDto {
        id: claims.sub,
        username,
        email: claims.email,
    }
}

#[cfg(test)]
mod tests {
    use std::sync::Arc;

    use axum::{
        body::Body,
        http::{Request, StatusCode},
    };
    use tokio::sync::RwLock;
    use tower::ServiceExt;
    use utils::types::jwks::JwkSet;
    use uuid::Uuid;

    use super::*;

    fn claims(preferred_username: Option<&str>, name: Option<&str>, email: Option<&str>) -> Claims {
        Claims {
            sub: Uuid::nil(),
            email: email.map(Into::into),
            preferred_username: preferred_username.map(Into::into),
            name: name.map(Into::into),
        }
    }

    #[test]
    fn names_a_new_user_with_the_best_claim_available() {
        let pick = |c: Claims| token_user(c).username;

        assert_eq!(
            pick(claims(Some("ada"), Some("Ada L"), Some("a@x.test"))),
            "ada"
        );
        assert_eq!(pick(claims(None, Some("Ada L"), Some("a@x.test"))), "Ada L");
        assert_eq!(pick(claims(None, None, Some("a@x.test"))), "a@x.test");
        assert_eq!(pick(claims(None, None, None)), Uuid::nil().to_string());
    }

    #[tokio::test]
    async fn requires_a_token() {
        let pool = sqlx::postgres::PgPoolOptions::new()
            .connect_lazy("postgres://nobody@127.0.0.1:1/none")
            .unwrap();
        let auth = InternalAuthState {
            jwks: Arc::new(RwLock::new(JwkSet { keys: Vec::new() })),
            authentik_jwks_url: Arc::new("http://127.0.0.1:1/jwks".into()),
            authentik_audience: Arc::new("client".into()),
            authentik_issuer: None,
        };

        let response = router(auth)
            .with_state(pool)
            .oneshot(Request::get("/me").body(Body::empty()).unwrap())
            .await
            .unwrap();

        assert_eq!(response.status(), StatusCode::UNAUTHORIZED);
    }
}
