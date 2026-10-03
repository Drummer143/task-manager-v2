//! Keeps `users` in step with authentik: users are created, changed and deleted there only.

use axum::{extract::State, http::StatusCode};
use chrono::{DateTime, Utc};
use error_handlers::{ApiError, extract::ApiJson};
use serde::Deserialize;
use sqlx::PgPool;
use uuid::Uuid;

use crate::repos::users::{AuthentikUserDto, UsersRepository};

/// The body built by the blueprint's mapping (`user-sync-with-backed-mapping`).
#[derive(Debug, Deserialize, PartialEq)]
#[serde(tag = "event", content = "payload")]
pub enum UserSyncEvent {
    #[serde(rename = "user_created")]
    Created(AuthentikUser),
    #[serde(rename = "user_updated")]
    Updated(AuthentikUser),
    /// Sent after the user is gone in authentik, so only the pk is known.
    #[serde(rename = "user_deleted")]
    Deleted { pk: i32 },
}

#[derive(Debug, Deserialize, PartialEq)]
pub struct AuthentikUser {
    pk: i32,
    uuid: Uuid,
    username: String,
    /// Left out by the mapping when blank.
    #[serde(default)]
    email: Option<String>,
    is_active: bool,
    created_at: DateTime<Utc>,
}

impl From<AuthentikUser> for AuthentikUserDto {
    fn from(user: AuthentikUser) -> Self {
        Self {
            id: user.uuid,
            authentik_id: user.pk,
            username: user.username,
            email: user.email,
            is_active: user.is_active,
            created_at: user.created_at,
        }
    }
}

/// authentik only checks for a 2xx, and retries nothing: a failure here is logged on both sides.
pub async fn user_sync(
    State(pool): State<PgPool>,
    ApiJson(event): ApiJson<UserSyncEvent>,
) -> Result<StatusCode, ApiError> {
    match event {
        // Created and updated are handled alike: an update may be the first event main-service
        // sees for a user (for instance one created while it was down)
        UserSyncEvent::Created(user) | UserSyncEvent::Updated(user) => {
            let user = UsersRepository::upsert_from_authentik(&pool, user.into()).await?;
            tracing::info!(user_id = %user.id, authentik_id = user.authentik_id, "user synced from authentik");
        }
        UserSyncEvent::Deleted { pk } => {
            if UsersRepository::delete_by_authentik_id(&pool, pk).await? {
                tracing::info!(authentik_id = pk, "user deleted in authentik");
            } else {
                tracing::warn!(
                    authentik_id = pk,
                    "deletion of a user main-service does not know"
                );
            }
        }
    }

    Ok(StatusCode::NO_CONTENT)
}

#[cfg(test)]
mod tests {
    use axum::{
        Router,
        body::Body,
        http::{Request, header},
    };
    use tower::ServiceExt;
    use utils::service_auth::ServiceAuthState;

    use super::*;

    #[test]
    fn reads_the_blueprint_payloads() {
        let created: UserSyncEvent = serde_json::from_str(
            r#"{"event":"user_created","payload":{"pk":7,"uuid":"0b9e8a52-4a5c-4f0e-9d6b-4c1f2f3e4a5b",
                "username":"ada","is_active":true,"created_at":"2026-10-02T12:00:00.123456+00:00",
                "email":"ada@example.test"}}"#,
        )
        .unwrap();
        let UserSyncEvent::Created(user) = created else {
            panic!("expected user_created");
        };
        assert_eq!(
            (user.pk, user.email.as_deref()),
            (7, Some("ada@example.test"))
        );

        // No email when it is blank in authentik
        let updated: UserSyncEvent = serde_json::from_str(
            r#"{"event":"user_updated","payload":{"pk":7,"uuid":"0b9e8a52-4a5c-4f0e-9d6b-4c1f2f3e4a5b",
                "username":"ada","is_active":false,"created_at":"2026-10-02T12:00:00+00:00"}}"#,
        )
        .unwrap();
        assert!(matches!(
            updated,
            UserSyncEvent::Updated(AuthentikUser {
                email: None,
                is_active: false,
                ..
            })
        ));

        let deleted: UserSyncEvent =
            serde_json::from_str(r#"{"event":"user_deleted","payload":{"pk":7}}"#).unwrap();
        assert_eq!(deleted, UserSyncEvent::Deleted { pk: 7 });
    }

    #[test]
    fn rejects_unknown_events() {
        assert!(
            serde_json::from_str::<UserSyncEvent>(r#"{"event":"user_renamed","payload":{"pk":7}}"#)
                .is_err()
        );
    }

    /// A pool that never connects: requests that get through fail later, at the database.
    fn app() -> Router {
        let pool = sqlx::postgres::PgPoolOptions::new()
            .acquire_timeout(std::time::Duration::from_millis(200))
            .connect_lazy("postgres://nobody@127.0.0.1:1/none")
            .unwrap();
        crate::webhooks::authentik::router(ServiceAuthState::new("webhook-token")).with_state(pool)
    }

    fn post(token: Option<&str>, body: &str) -> Request<Body> {
        let mut request = Request::post("/webhooks/authentik/user_sync")
            .header(header::CONTENT_TYPE, "application/json");
        if let Some(token) = token {
            request = request.header(header::AUTHORIZATION, format!("Bearer {token}"));
        }
        request.body(Body::from(body.to_owned())).unwrap()
    }

    const DELETED: &str = r#"{"event":"user_deleted","payload":{"pk":7}}"#;

    #[tokio::test]
    async fn requires_the_webhook_token() {
        for token in [None, Some("wrong")] {
            let response = app().oneshot(post(token, DELETED)).await.unwrap();
            assert_eq!(response.status(), StatusCode::UNAUTHORIZED);
        }
    }

    #[tokio::test]
    async fn with_the_token_a_valid_event_reaches_the_database() {
        let response = app()
            .oneshot(post(Some("webhook-token"), DELETED))
            .await
            .unwrap();
        assert_eq!(response.status(), StatusCode::INTERNAL_SERVER_ERROR);
    }

    #[tokio::test]
    async fn a_malformed_body_is_a_client_error() {
        let response = app()
            .oneshot(post(Some("webhook-token"), r#"{"event":"nope"}"#))
            .await
            .unwrap();
        assert!(response.status().is_client_error());
    }
}
