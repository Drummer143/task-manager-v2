#![cfg(feature = "axum")]

use axum::{
    Router,
    body::{Body, to_bytes},
    http::{Request, Response, StatusCode},
    middleware::from_fn,
    routing::get,
};
use error_handlers::{
    ApiError, ErrorCode,
    extract::ApiQuery,
    fallback,
    trace::{REQUEST_ID_HEADER, current_trace_id, request_id},
};
use serde::Deserialize;
use serde_json::Value;
use tower::ServiceExt;

#[derive(Deserialize)]
struct Paging {
    #[allow(dead_code)]
    limit: u32,
}

fn app() -> Router {
    Router::new()
        .route(
            "/ok",
            get(|| async { current_trace_id().unwrap_or_default() }),
        )
        .route(
            "/fail",
            get(|| async { Err::<(), _>(ApiError::new(ErrorCode::Conflict)) }),
        )
        .route(
            "/fail-explicit",
            get(|| async {
                Err::<(), _>(ApiError::new(ErrorCode::Conflict).with_trace_id("mine"))
            }),
        )
        .route("/list", get(|ApiQuery(_): ApiQuery<Paging>| async {}))
        // The layer goes last so it also wraps the fallbacks.
        .fallback(fallback::not_found)
        .layer(from_fn(request_id))
}

async fn get_with(uri: &str, incoming_id: Option<&str>) -> (Response<Body>, Value) {
    let mut request = Request::builder().uri(uri);
    if let Some(id) = incoming_id {
        request = request.header(&REQUEST_ID_HEADER, id);
    }
    let response = app()
        .oneshot(request.body(Body::empty()).unwrap())
        .await
        .unwrap();

    let (parts, body) = response.into_parts();
    let bytes = to_bytes(body, usize::MAX).await.unwrap();
    let json = serde_json::from_slice(&bytes).unwrap_or(Value::Null);
    (Response::from_parts(parts, Body::empty()), json)
}

fn header_id(response: &Response<Body>) -> String {
    response.headers()[&REQUEST_ID_HEADER]
        .to_str()
        .unwrap()
        .to_owned()
}

#[tokio::test]
async fn success_response_gets_a_generated_id_header() {
    let (response, _) = get_with("/ok", None).await;
    assert_eq!(response.status(), StatusCode::OK);
    assert!(uuid::Uuid::parse_str(&header_id(&response)).is_ok());
}

#[tokio::test]
async fn handler_can_read_the_current_id() {
    let request = Request::builder()
        .uri("/ok")
        .header(&REQUEST_ID_HEADER, "req-1")
        .body(Body::empty())
        .unwrap();
    let response = app().oneshot(request).await.unwrap();
    let bytes = to_bytes(response.into_body(), usize::MAX).await.unwrap();
    assert_eq!(&bytes[..], b"req-1");
}

#[tokio::test]
async fn caller_supplied_id_is_reused_in_header_and_error_body() {
    let (response, json) = get_with("/fail", Some("abc-123")).await;
    assert_eq!(header_id(&response), "abc-123");
    assert_eq!(json["trace_id"], "abc-123");
    assert_eq!(json["code"], "CONFLICT");
}

#[tokio::test]
async fn unsafe_incoming_id_is_replaced() {
    let (response, json) = get_with("/fail", Some("has space")).await;
    let id = header_id(&response);
    assert_ne!(id, "has space");
    assert_eq!(json["trace_id"], id);
}

#[tokio::test]
async fn explicit_trace_id_on_the_error_wins() {
    let (response, json) = get_with("/fail-explicit", Some("from-header")).await;
    assert_eq!(header_id(&response), "from-header");
    assert_eq!(json["trace_id"], "mine");
}

#[tokio::test]
async fn fallback_and_extractor_errors_carry_the_id_too() {
    let (response, json) = get_with("/missing", Some("r-404")).await;
    assert_eq!(response.status(), StatusCode::NOT_FOUND);
    assert_eq!(json["trace_id"], "r-404");

    let (response, json) = get_with("/list?limit=abc", Some("r-400")).await;
    assert_eq!(response.status(), StatusCode::BAD_REQUEST);
    assert_eq!(json["trace_id"], "r-400");
}

#[tokio::test]
async fn ids_are_not_shared_between_requests() {
    let (first, _) = get_with("/ok", None).await;
    let (second, _) = get_with("/ok", None).await;
    assert_ne!(header_id(&first), header_id(&second));
}
