#![cfg(feature = "axum")]

use axum::{
    Router,
    body::{Body, to_bytes},
    extract::DefaultBodyLimit,
    http::{Method, Request, StatusCode, header},
    routing::{get, post},
};
use error_handlers::{
    extract::{ApiJson, ApiPath, ApiQuery},
    fallback,
};
use serde::Deserialize;
use serde_json::Value;
use tower::ServiceExt;

#[derive(Deserialize)]
struct Payload {
    name: String,
}

#[derive(Deserialize)]
struct Paging {
    limit: u32,
}

fn app() -> Router {
    Router::new()
        .route(
            "/items",
            post(|ApiJson(p): ApiJson<Payload>| async move { p.name }),
        )
        .route(
            "/list",
            get(|ApiQuery(q): ApiQuery<Paging>| async move { q.limit.to_string() }),
        )
        .route(
            "/items/{id}",
            get(|ApiPath(id): ApiPath<u32>| async move { id.to_string() }),
        )
        .layer(DefaultBodyLimit::max(64))
        .fallback(fallback::not_found)
        .method_not_allowed_fallback(fallback::method_not_allowed)
}

async fn send(
    method: Method,
    uri: &str,
    content_type: Option<&str>,
    body: &str,
) -> (StatusCode, Option<String>, Value) {
    let mut request = Request::builder().method(method).uri(uri);
    if let Some(content_type) = content_type {
        request = request.header(header::CONTENT_TYPE, content_type);
    }
    let response = app()
        .oneshot(request.body(Body::from(body.to_owned())).unwrap())
        .await
        .unwrap();

    let status = response.status();
    let content_type = response
        .headers()
        .get(header::CONTENT_TYPE)
        .map(|v| v.to_str().unwrap().to_owned());
    let bytes = to_bytes(response.into_body(), usize::MAX).await.unwrap();
    let json = serde_json::from_slice(&bytes).unwrap_or(Value::Null);
    (status, content_type, json)
}

/// Every failure must be problem+json with the expected code, and must not carry free text.
fn assert_problem(status: StatusCode, content_type: Option<String>, json: &Value, code: &str) {
    assert_eq!(content_type.as_deref(), Some("application/problem+json"));
    assert_eq!(json["code"], code);
    assert_eq!(json["status"], status.as_u16());
    for forbidden in ["message", "detail", "title"] {
        assert!(json.get(forbidden).is_none());
    }
}

#[tokio::test]
async fn success_still_works() {
    let (status, _, _) = send(
        Method::POST,
        "/items",
        Some("application/json"),
        r#"{"name":"x"}"#,
    )
    .await;
    assert_eq!(status, StatusCode::OK);
}

#[tokio::test]
async fn broken_json_is_malformed_request() {
    let (status, ct, json) = send(
        Method::POST,
        "/items",
        Some("application/json"),
        "{not json",
    )
    .await;
    assert_eq!(status, StatusCode::BAD_REQUEST);
    assert_problem(status, ct, &json, "MALFORMED_REQUEST");
    assert!(!json.to_string().contains("not json"));
}

#[tokio::test]
async fn wrong_json_shape_is_malformed_request() {
    let (status, ct, json) = send(
        Method::POST,
        "/items",
        Some("application/json"),
        r#"{"name":1}"#,
    )
    .await;
    assert_eq!(status, StatusCode::BAD_REQUEST);
    assert_problem(status, ct, &json, "MALFORMED_REQUEST");
}

#[tokio::test]
async fn wrong_content_type_is_unsupported_media_type() {
    let (status, ct, json) = send(
        Method::POST,
        "/items",
        Some("text/plain"),
        r#"{"name":"x"}"#,
    )
    .await;
    assert_eq!(status, StatusCode::UNSUPPORTED_MEDIA_TYPE);
    assert_problem(status, ct, &json, "UNSUPPORTED_MEDIA_TYPE");
}

#[tokio::test]
async fn oversized_body_is_payload_too_large() {
    let body = format!(r#"{{"name":"{}"}}"#, "x".repeat(200));
    let (status, ct, json) = send(Method::POST, "/items", Some("application/json"), &body).await;
    assert_eq!(status, StatusCode::PAYLOAD_TOO_LARGE);
    assert_problem(status, ct, &json, "PAYLOAD_TOO_LARGE");
}

#[tokio::test]
async fn bad_query_is_malformed_request() {
    let (status, ct, json) = send(Method::GET, "/list?limit=abc", None, "").await;
    assert_eq!(status, StatusCode::BAD_REQUEST);
    assert_problem(status, ct, &json, "MALFORMED_REQUEST");
}

#[tokio::test]
async fn bad_path_param_is_malformed_request() {
    let (status, ct, json) = send(Method::GET, "/items/abc", None, "").await;
    assert_eq!(status, StatusCode::BAD_REQUEST);
    assert_problem(status, ct, &json, "MALFORMED_REQUEST");
}

#[tokio::test]
async fn unknown_route_is_not_found() {
    let (status, ct, json) = send(Method::GET, "/nope", None, "").await;
    assert_eq!(status, StatusCode::NOT_FOUND);
    assert_problem(status, ct, &json, "NOT_FOUND");
}

#[tokio::test]
async fn wrong_method_is_405_with_allow_header() {
    let response = app()
        .oneshot(
            Request::builder()
                .method(Method::DELETE)
                .uri("/items")
                .body(Body::empty())
                .unwrap(),
        )
        .await
        .unwrap();
    assert_eq!(response.status(), StatusCode::METHOD_NOT_ALLOWED);
    assert!(
        response.headers().contains_key(header::ALLOW),
        "axum should keep the Allow header"
    );

    let (status, ct, json) = send(Method::DELETE, "/items", None, "").await;
    assert_problem(status, ct, &json, "METHOD_NOT_ALLOWED");
}
