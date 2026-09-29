#![cfg(feature = "axum")]

use std::time::Duration;

use axum::{
    Router,
    body::{Body, to_bytes},
    http::{Request, StatusCode, header},
    middleware::from_fn,
    routing::get,
};
use error_handlers::{
    fallback, guard,
    trace::{REQUEST_ID_HEADER, request_id},
};
use serde_json::Value;
use tower::ServiceExt;

async fn boom() -> &'static str {
    panic!("boom: secret detail")
}

fn app() -> Router {
    let routes = Router::new()
        .route("/ok", get(|| async { "fine" }))
        .route("/panic", get(boom))
        .route(
            "/slow",
            get(|| async {
                tokio::time::sleep(Duration::from_secs(5)).await;
                "too late"
            }),
        );

    guard::request_timeout(guard::catch_panics(routes), Duration::from_millis(50))
        .fallback(fallback::not_found)
        .layer(from_fn(request_id))
}

async fn get_json(uri: &str) -> (StatusCode, String, Value, String) {
    let request = Request::builder()
        .uri(uri)
        .header(&REQUEST_ID_HEADER, "req-guard")
        .body(Body::empty())
        .unwrap();
    let response = app().oneshot(request).await.unwrap();

    let status = response.status();
    let content_type = response.headers()[header::CONTENT_TYPE]
        .to_str()
        .unwrap()
        .to_owned();
    let bytes = to_bytes(response.into_body(), usize::MAX).await.unwrap();
    let raw = String::from_utf8(bytes.to_vec()).unwrap();
    let json = serde_json::from_str(&raw).unwrap_or(Value::Null);
    (status, content_type, json, raw)
}

#[tokio::test]
async fn healthy_requests_are_untouched() {
    let (status, _, _, raw) = get_json("/ok").await;
    assert_eq!(status, StatusCode::OK);
    assert_eq!(raw, "fine");
}

#[tokio::test]
async fn panic_becomes_internal_problem_json_without_leaking_the_message() {
    let (status, content_type, json, raw) = get_json("/panic").await;

    assert_eq!(status, StatusCode::INTERNAL_SERVER_ERROR);
    assert_eq!(content_type, "application/problem+json");
    assert_eq!(json["code"], "INTERNAL");
    assert_eq!(json["trace_id"], "req-guard");
    assert!(!raw.contains("secret"), "panic text leaked: {raw}");
}

#[tokio::test]
async fn slow_handler_becomes_gateway_timeout() {
    let (status, content_type, json, _) = get_json("/slow").await;

    assert_eq!(status, StatusCode::GATEWAY_TIMEOUT);
    assert_eq!(content_type, "application/problem+json");
    assert_eq!(json["code"], "TIMEOUT");
    assert_eq!(json["status"], 504);
    assert_eq!(json["trace_id"], "req-guard");
}
