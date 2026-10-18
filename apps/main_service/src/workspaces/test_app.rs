//! The routes of one workspace (`router::workspace_routes`) with the database tests' fixtures.
//! Signals are recorded, not sent: a test reads them back.

use axum::{
    Extension, Router,
    body::{Body, to_bytes},
    extract::FromRef,
    http::{Request, StatusCode},
};
use serde_json::Value;
use sqlx::PgPool;
use tower::ServiceExt;
use uuid::Uuid;

use crate::{
    signals::{Sent, Signals},
    workspaces::{repo, router::workspace_routes},
};

#[derive(Clone, FromRef)]
struct TestState {
    pool: PgPool,
    signals: Signals,
}

/// A request to the workspace's routes, as `user_id` from the tab `client_id`.
pub struct Call<'a> {
    pub pool: &'a PgPool,
    pub signals: &'a Signals,
    pub client_id: Option<Uuid>,
    pub user_id: Uuid,
}

impl Call<'_> {
    /// `method` on `/workspaces/{workspace_id}{path}`; the status and the JSON body (`null`
    /// when there is none).
    pub async fn send(
        &self,
        method: &str,
        workspace_id: Uuid,
        path: &str,
        body: Option<Value>,
    ) -> (StatusCode, Value) {
        let mut request = Request::builder()
            .method(method)
            .uri(format!("/workspaces/{workspace_id}{path}"))
            .header("content-type", "application/json");
        if let Some(client_id) = self.client_id {
            request = request.header("X-Client-Id", client_id.to_string());
        }
        let request = match body {
            Some(body) => request.body(Body::from(body.to_string())),
            None => request.body(Body::empty()),
        }
        .unwrap();

        let state = TestState {
            pool: self.pool.clone(),
            signals: self.signals.clone(),
        };
        let app = Router::new()
            .nest(
                "/workspaces/{workspace_id}",
                workspace_routes(state.clone()),
            )
            .with_state(state)
            .layer(Extension(self.user_id));

        let response = app.oneshot(request).await.unwrap();
        let status = response.status();
        let bytes = to_bytes(response.into_body(), usize::MAX).await.unwrap();

        (
            status,
            serde_json::from_slice(&bytes).unwrap_or(Value::Null),
        )
    }
}

/// `method` as `user_id`, with no tab id; the signals are dropped.
pub async fn send(
    pool: &PgPool,
    user_id: Uuid,
    method: &str,
    workspace_id: Uuid,
    path: &str,
    body: Option<Value>,
) -> (StatusCode, Value) {
    let signals = Signals::recorded();
    let call = Call {
        pool,
        signals: &signals,
        client_id: None,
        user_id,
    };
    call.send(method, workspace_id, path, body).await
}

/// `method` as `user_id` from the tab `client_id`: the status and the signals it sent.
pub async fn send_from(
    pool: &PgPool,
    client_id: Uuid,
    user_id: Uuid,
    method: &str,
    workspace_id: Uuid,
    path: &str,
    body: Option<Value>,
) -> (StatusCode, Vec<Sent>) {
    let signals = Signals::recorded();
    let call = Call {
        pool,
        signals: &signals,
        client_id: Some(client_id),
        user_id,
    };
    let (status, _) = call.send(method, workspace_id, path, body).await;
    (status, signals.sent())
}

pub async fn user(pool: &PgPool) -> Uuid {
    let id = Uuid::now_v7();
    sqlx::query("INSERT INTO users (id, username) VALUES ($1, 'test')")
        .bind(id)
        .execute(pool)
        .await
        .unwrap();
    id
}

/// A new workspace "Verso team" of `owner`, with the built-in roles.
pub async fn workspace_of(pool: &PgPool, owner: Uuid, slug: &str) -> Uuid {
    let id = Uuid::now_v7();
    repo::init_workspace(
        pool,
        repo::CreateWorkspaceRequest {
            id,
            name: "Verso team".into(),
            slug: slug.into(),
            task_prefix: "VT".into(),
        },
        &owner,
    )
    .await
    .unwrap();
    id
}

/// A new member without any role.
pub async fn guest_of(pool: &PgPool, workspace_id: Uuid) -> Uuid {
    let guest = user(pool).await;
    sqlx::query("INSERT INTO members (workspace_id, user_id) VALUES ($1, $2)")
        .bind(workspace_id)
        .bind(guest)
        .execute(pool)
        .await
        .unwrap();
    guest
}

/// A new member with the built-in Member role.
pub async fn member_of(pool: &PgPool, workspace_id: Uuid) -> Uuid {
    let member = guest_of(pool, workspace_id).await;
    sqlx::query(
        "INSERT INTO member_roles (workspace_id, user_id, role_id)
         SELECT $1, $2, id FROM roles WHERE workspace_id = $1 AND builtin = 'member'",
    )
    .bind(workspace_id)
    .bind(member)
    .execute(pool)
    .await
    .unwrap();
    member
}

/// The workspace's history: version, field, old and new value.
pub async fn history(pool: &PgPool, workspace_id: Uuid) -> Vec<(i64, String, Value, Value)> {
    sqlx::query_as(
        "SELECT version, field, old_value, new_value FROM field_changes
         WHERE entity_id = $1 ORDER BY version, field",
    )
    .bind(workspace_id)
    .fetch_all(pool)
    .await
    .unwrap()
}

/// The signals of a change of the workspace (`updates::publish_changed`), the members' in the
/// order of their ids.
pub fn workspace_changed(
    kind: &str,
    workspace_id: Uuid,
    mut members: Vec<Uuid>,
    origin: Uuid,
) -> Vec<Sent> {
    let sent = |topic: String, tag: String| Sent {
        topic,
        event: "data.changed".into(),
        payload: serde_json::json!({ "type": kind, "tags": [tag], "origin": origin.to_string() }),
    };

    members.sort();
    std::iter::once(sent(
        format!("workspace:{workspace_id}"),
        format!("workspace:{workspace_id}"),
    ))
    .chain(
        members
            .into_iter()
            .map(|user_id| sent(format!("user:{user_id}"), "workspaces".into())),
    )
    .collect()
}

/// `sent` with the members' signals in the order of their ids, to compare with
/// `workspace_changed`.
pub fn sorted(mut sent: Vec<Sent>) -> Vec<Sent> {
    if sent.len() > 1 {
        sent[1..].sort_by(|a, b| a.topic.cmp(&b.topic));
    }
    sent
}
