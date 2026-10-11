//! Access rules, checked through the real routers. Nothing here needs Postgres, Redis or a real
//! main service: requests that must be refused never reach the database, and requests that must
//! get through are recognised by failing *later*, at the (unreachable) database.

use axum::{
    Extension, Json, Router,
    body::{Body, to_bytes},
    extract::State,
    http::{Method, Request, StatusCode, header},
};
use error_handlers::{ErrorCode, extract::ApiJson};
use serde_json::Value;
use tower::ServiceExt;
use utils::types::asset_access::AssetVisibility;
use uuid::Uuid;

use crate::{
    entities::{
        actions, files,
        files::{
            controller::issue_links::issue_links,
            links::{FileLinksRequest, MAX_LINKS_PER_REQUEST},
            signing::{self, FileLinkClaims},
        },
        internal,
    },
    test_support::{asset, spawn_mock},
    types::app_state::AppState,
};

const NO_MAIN: &str = "http://127.0.0.1:1";

fn app(state: &AppState) -> Router {
    Router::new()
        .merge(files::router::init(state.clone()))
        .merge(internal::router::init(state.clone()))
        .merge(actions::router::init(state.clone()))
        .with_state(state.clone())
}

async fn call(app: &Router, request: Request<Body>) -> (StatusCode, Value) {
    let response = app.clone().oneshot(request).await.unwrap();
    let status = response.status();
    let bytes = to_bytes(response.into_body(), usize::MAX).await.unwrap();
    (status, serde_json::from_slice(&bytes).unwrap_or(Value::Null))
}

fn get(uri: &str) -> Request<Body> {
    Request::builder().uri(uri).body(Body::empty()).unwrap()
}

fn signed(asset: Uuid, exp: u64, secret: &str) -> String {
    signing::sign(
        secret,
        &FileLinkClaims {
            asset,
            blob: Uuid::now_v7(),
            name: "cat.png".into(),
            exp,
        },
    )
    .unwrap()
}

// ------------------------------------------------------------------ signed (private) links

#[tokio::test]
async fn a_private_file_without_a_signature_is_refused() {
    let app = app(&AppState::for_tests(NO_MAIN));

    let (status, body) = call(&app, get(&format!("/files/{}", Uuid::now_v7()))).await;

    assert_eq!(status, StatusCode::FORBIDDEN);
    assert_eq!(body["code"], "FILE_LINK_INVALID");
}

#[tokio::test]
async fn a_garbage_or_foreign_signature_is_refused() {
    let app = app(&AppState::for_tests(NO_MAIN));
    let asset_id = Uuid::now_v7();
    let foreign = signed(asset_id, signing::now_secs() + 60, "another-secret-another-secret-123");

    for sig in ["nonsense", foreign.as_str()] {
        let (status, body) = call(&app, get(&format!("/files/{asset_id}?sig={sig}"))).await;

        assert_eq!(status, StatusCode::FORBIDDEN, "{sig}");
        assert_eq!(body["code"], "FILE_LINK_INVALID", "{sig}");
    }
}

#[tokio::test]
async fn an_expired_link_says_so_and_a_link_for_another_asset_is_invalid() {
    let app = app(&AppState::for_tests(NO_MAIN));
    let asset_id = Uuid::now_v7();

    let expired = signed(asset_id, signing::now_secs() - 1, AppState::TEST_LINK_SECRET);
    let (status, body) = call(&app, get(&format!("/files/{asset_id}?sig={expired}"))).await;
    assert_eq!(status, StatusCode::FORBIDDEN);
    assert_eq!(body["code"], "FILE_LINK_EXPIRED");

    let other = signed(Uuid::now_v7(), signing::now_secs() + 60, AppState::TEST_LINK_SECRET);
    let (status, body) = call(&app, get(&format!("/files/{asset_id}?sig={other}"))).await;
    assert_eq!(status, StatusCode::FORBIDDEN);
    assert_eq!(body["code"], "FILE_LINK_INVALID");
}

#[tokio::test]
async fn a_valid_link_passes_the_gate_and_only_then_needs_the_database() {
    let app = app(&AppState::for_tests(NO_MAIN));
    let asset_id = Uuid::now_v7();
    let sig = signed(asset_id, signing::now_secs() + 60, AppState::TEST_LINK_SECRET);

    let (status, body) = call(&app, get(&format!("/files/{asset_id}?sig={sig}"))).await;

    // Not a 403: the link was accepted. The test database is unreachable, hence the 500.
    assert_eq!(status, StatusCode::INTERNAL_SERVER_ERROR);
    assert_eq!(body["code"], "INTERNAL");
}

// ------------------------------------------------------------------ public files

#[tokio::test]
async fn a_private_or_unknown_asset_is_not_found_on_the_public_route() {
    let private = asset(AssetVisibility::Private);
    let mock = spawn_mock(vec![private.clone()], false).await;
    let app = app(&AppState::for_tests(&mock.url));

    for id in [private.id, Uuid::now_v7()] {
        let (status, body) = call(&app, get(&format!("/public/files/{id}"))).await;

        assert_eq!(status, StatusCode::NOT_FOUND, "{id}");
        assert_eq!(body["code"], "NOT_FOUND", "{id}");
    }
}

#[tokio::test]
async fn a_public_asset_passes_the_gate_without_any_credentials() {
    let public = asset(AssetVisibility::Public);
    let mock = spawn_mock(vec![public.clone()], false).await;
    let app = app(&AppState::for_tests(&mock.url));

    let (status, body) = call(&app, get(&format!("/public/files/{}", public.id))).await;

    // Past the access check; stopped by the unreachable test database.
    assert_eq!(status, StatusCode::INTERNAL_SERVER_ERROR);
    assert_eq!(body["code"], "INTERNAL");
    assert_eq!(mock.calls(), 1);
}

#[tokio::test]
async fn the_public_route_reports_an_unreachable_main_service_as_502() {
    let app = app(&AppState::for_tests(NO_MAIN));

    let (status, body) = call(&app, get(&format!("/public/files/{}", Uuid::now_v7()))).await;

    assert_eq!(status, StatusCode::BAD_GATEWAY);
    assert_eq!(body["code"], "UPSTREAM_UNAVAILABLE");
}

#[tokio::test]
async fn repeated_public_requests_do_not_hammer_the_main_service() {
    let mock = spawn_mock(vec![], false).await;
    let app = app(&AppState::for_tests(&mock.url));
    let id = Uuid::now_v7();

    for _ in 0..5 {
        call(&app, get(&format!("/public/files/{id}"))).await;
    }

    assert_eq!(mock.calls(), 1);
}

// ------------------------------------------------------------------ batched links

fn links_request(ids: Vec<Uuid>) -> ApiJson<FileLinksRequest> {
    ApiJson(FileLinksRequest { asset_ids: ids })
}

#[tokio::test]
async fn many_assets_cost_one_call_to_the_main_service() {
    let public = asset(AssetVisibility::Public);
    let private = asset(AssetVisibility::Private);
    let hidden = Uuid::now_v7();
    let mock = spawn_mock(vec![public.clone(), private.clone()], false).await;
    let state = AppState::for_tests(&mock.url);

    let mut ids = vec![public.id, private.id, hidden];
    ids.extend((0..100).map(|_| Uuid::now_v7()));

    let Json(response) = issue_links(
        State(state),
        Extension(Uuid::now_v7()),
        links_request(ids),
    )
    .await
    .unwrap();

    assert_eq!(mock.calls(), 1, "one batched call, not one per asset");
    assert_eq!(response.links.len(), 2);
    assert_eq!(response.unavailable.len(), 101);
    assert!(response.unavailable.contains(&hidden));

    let public_link = response.links.iter().find(|l| l.asset_id == public.id).unwrap();
    assert_eq!(public_link.visibility, AssetVisibility::Public);
    assert!(public_link.url.starts_with("https://files.test/public/files/"));
    assert_eq!(public_link.expires_at, None);

    let private_link = response.links.iter().find(|l| l.asset_id == private.id).unwrap();
    assert!(private_link.url.contains("/files/") && private_link.url.contains("?sig="));
    assert!(private_link.expires_at.is_some());
}

#[tokio::test]
async fn an_issued_private_link_is_accepted_by_the_download_route() {
    let private = asset(AssetVisibility::Private);
    let mock = spawn_mock(vec![private.clone()], false).await;
    let state = AppState::for_tests(&mock.url);

    let Json(response) = issue_links(
        State(state.clone()),
        Extension(Uuid::now_v7()),
        links_request(vec![private.id]),
    )
    .await
    .unwrap();

    let path = response.links[0].url.strip_prefix("https://files.test").unwrap().to_owned();
    let (status, body) = call(&app(&state), get(&path)).await;

    // Accepted by the signature check, then stopped by the unreachable test database.
    assert_eq!(status, StatusCode::INTERNAL_SERVER_ERROR);
    assert_eq!(body["code"], "INTERNAL");
}

#[tokio::test]
async fn an_empty_batch_does_not_call_the_main_service_at_all() {
    let mock = spawn_mock(vec![], false).await;

    let Json(response) = issue_links(
        State(AppState::for_tests(&mock.url)),
        Extension(Uuid::now_v7()),
        links_request(vec![]),
    )
    .await
    .unwrap();

    assert!(response.links.is_empty() && response.unavailable.is_empty());
    assert_eq!(mock.calls(), 0);
}

#[tokio::test]
async fn an_oversized_batch_is_rejected_before_asking_the_main_service() {
    let mock = spawn_mock(vec![], false).await;
    let ids = (0..=MAX_LINKS_PER_REQUEST).map(|_| Uuid::now_v7()).collect();

    let error = issue_links(
        State(AppState::for_tests(&mock.url)),
        Extension(Uuid::now_v7()),
        links_request(ids),
    )
    .await
    .unwrap_err();

    assert_eq!(
        error.code(),
        &ErrorCode::TooManyItems {
            max_items: MAX_LINKS_PER_REQUEST as u64
        }
    );
    assert_eq!(mock.calls(), 0);
}

#[tokio::test]
async fn issuing_links_surfaces_a_failing_main_service_as_502() {
    let mock = spawn_mock(vec![], true).await;

    let error = issue_links(
        State(AppState::for_tests(&mock.url)),
        Extension(Uuid::now_v7()),
        links_request(vec![Uuid::now_v7()]),
    )
    .await
    .unwrap_err();

    assert_eq!(error.code(), &ErrorCode::UpstreamUnavailable);
}

#[tokio::test]
async fn issuing_links_requires_a_signed_in_user() {
    let app = app(&AppState::for_tests(NO_MAIN));
    let request = Request::builder()
        .method(Method::POST)
        .uri("/files/links")
        .header(header::CONTENT_TYPE, "application/json")
        .body(Body::from(r#"{"assetIds":[]}"#))
        .unwrap();

    let (status, body) = call(&app, request).await;

    assert_eq!(status, StatusCode::UNAUTHORIZED);
    assert_eq!(body["code"], "UNAUTHORIZED");
}

// ------------------------------------------------------------------ internal endpoints

fn upload_with(authorization: Option<&str>) -> Request<Body> {
    let mut request = Request::builder().method(Method::POST).uri("/internal/upload");
    if let Some(value) = authorization {
        request = request.header(header::AUTHORIZATION, value);
    }
    request.body(Body::empty()).unwrap()
}

#[tokio::test]
async fn internal_endpoints_refuse_everyone_but_the_service() {
    let app = app(&AppState::for_tests(NO_MAIN));

    for authorization in [
        None,
        Some("Bearer wrong"),
        // A user token is not a service token, however valid it may be elsewhere.
        Some("Bearer eyJhbGciOiJSUzI1NiJ9.e30.c2ln"),
    ] {
        let (status, body) = call(&app, upload_with(authorization)).await;

        assert_eq!(status, StatusCode::UNAUTHORIZED, "{authorization:?}");
        assert_eq!(body["code"], "UNAUTHORIZED", "{authorization:?}");
    }
}

#[tokio::test]
async fn internal_endpoints_open_for_the_service_token() {
    let app = app(&AppState::for_tests(NO_MAIN));
    let token = format!("Bearer {}", AppState::TEST_SERVICE_TOKEN);

    let (status, _) = call(&app, upload_with(Some(&token))).await;

    // Past the guard: the empty request is rejected by the handler (not a multipart upload).
    assert_ne!(status, StatusCode::UNAUTHORIZED);
}

// ------------------------------------------------------------------ upload steps

#[tokio::test]
async fn upload_steps_still_require_a_signed_in_user_and_ignore_tokens_in_the_url() {
    let app = app(&AppState::for_tests(NO_MAIN));
    let id = Uuid::now_v7();

    for uri in [
        format!("/actions/upload/{id}/status"),
        format!("/actions/upload/{id}/status?token=anything"),
    ] {
        let (status, body) = call(&app, get(&uri)).await;

        assert_eq!(status, StatusCode::UNAUTHORIZED, "{uri}");
        assert_eq!(body["code"], "UNAUTHORIZED", "{uri}");
    }
}
