//! Shared helpers for tests that need a main service to talk to.

use std::sync::{
    Arc,
    atomic::{AtomicUsize, Ordering},
};

use axum::{
    Json, Router,
    extract::State,
    http::{HeaderMap, StatusCode, header},
    routing::post,
};
use tokio::net::TcpListener;
use utils::types::asset_access::{
    AssetAccess, AssetAccessRequest, AssetAccessResponse, AssetVisibility,
};
use uuid::Uuid;

use crate::types::app_state::AppState;

#[derive(Clone)]
struct Mock {
    hits: Arc<AtomicUsize>,
    assets: Vec<AssetAccess>,
    fail: bool,
}

/// Plays the main service: checks the service token and answers like the real contract does.
async fn access(
    State(mock): State<Mock>,
    headers: HeaderMap,
    Json(request): Json<AssetAccessRequest>,
) -> Result<Json<AssetAccessResponse>, StatusCode> {
    mock.hits.fetch_add(1, Ordering::SeqCst);

    let expected = format!("Bearer {}", AppState::TEST_SERVICE_TOKEN);
    if headers
        .get(header::AUTHORIZATION)
        .and_then(|value| value.to_str().ok())
        != Some(expected.as_str())
    {
        return Err(StatusCode::UNAUTHORIZED);
    }
    if mock.fail {
        return Err(StatusCode::INTERNAL_SERVER_ERROR);
    }

    // Anonymous callers only ever see public assets; unknown ids are simply absent.
    let assets = mock
        .assets
        .iter()
        .filter(|asset| request.asset_ids.contains(&asset.id))
        .filter(|asset| request.user_id.is_some() || asset.visibility == AssetVisibility::Public)
        .cloned()
        .collect();
    Ok(Json(AssetAccessResponse { assets }))
}

/// A running mock main service: its base URL and a counter of the calls it received.
pub struct MockMain {
    pub url: String,
    pub hits: Arc<AtomicUsize>,
}

impl MockMain {
    pub fn calls(&self) -> usize {
        self.hits.load(Ordering::SeqCst)
    }
}

pub async fn spawn_mock(assets: Vec<AssetAccess>, fail: bool) -> MockMain {
    let hits = Arc::new(AtomicUsize::new(0));
    let app = Router::new()
        .route("/internal/assets/access", post(access))
        .with_state(Mock {
            hits: hits.clone(),
            assets,
            fail,
        });
    let listener = TcpListener::bind("127.0.0.1:0").await.unwrap();
    let address = listener.local_addr().unwrap();
    tokio::spawn(async move { axum::serve(listener, app).await.unwrap() });

    MockMain {
        url: format!("http://{address}/"),
        hits,
    }
}

pub fn asset(visibility: AssetVisibility) -> AssetAccess {
    AssetAccess {
        id: Uuid::now_v7(),
        blob_id: Uuid::now_v7(),
        name: "cat.png".into(),
        visibility,
    }
}
