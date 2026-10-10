//! The one place that talks to `main_service`.
//!
//! Every call carries the service token (see `utils::service_auth`) and a timeout, so a slow or
//! broken main service cannot hang storage requests.

use std::{fmt::Display, sync::Arc, time::Duration};

use error_handlers::{ApiError, ErrorCode};
use moka::future::Cache;
use utils::{
    service_auth::ServiceAuthState,
    types::asset_access::{
        AssetAccess, AssetAccessRequest, AssetAccessResponse, AssetVisibility,
    },
};
use uuid::Uuid;

const REQUEST_TIMEOUT: Duration = Duration::from_secs(5);

/// How long a public/not-public answer is reused. This is also how long un-publishing an asset
/// can take to reach people holding its stable public link.
pub const PUBLIC_ASSET_TTL: Duration = Duration::from_secs(60);

const PUBLIC_ASSET_CACHE_CAPACITY: u64 = 10_000;

#[derive(Clone)]
pub struct MainServiceClient {
    http: reqwest::Client,
    base_url: Arc<str>,
    service: ServiceAuthState,
    /// Answers for anonymous lookups, including "not public"/"unknown" (`None`), so repeated
    /// requests for a missing or private asset do not hit main service every time.
    public_assets: Cache<Uuid, Option<AssetAccess>>,
}

impl MainServiceClient {
    pub fn new(base_url: &str, service: ServiceAuthState) -> Self {
        Self {
            http: reqwest::Client::builder()
                .timeout(REQUEST_TIMEOUT)
                .build()
                .expect("failed to build the HTTP client"),
            base_url: base_url.trim_end_matches('/').into(),
            service,
            public_assets: Cache::builder()
                .max_capacity(PUBLIC_ASSET_CACHE_CAPACITY)
                .time_to_live(PUBLIC_ASSET_TTL)
                .build(),
        }
    }

    /// A `POST` to `path` on the main service, already authenticated as this service.
    pub fn post(&self, path: &str) -> reqwest::RequestBuilder {
        self.http
            .post(format!("{}{path}", self.base_url))
            .bearer_auth(self.service.token())
    }

    /// Which of `asset_ids` may `user_id` read (`None` = anonymous visitor)? One batched call;
    /// unknown and forbidden assets are both simply absent from the answer.
    pub async fn readable_assets(
        &self,
        user_id: Option<Uuid>,
        asset_ids: &[Uuid],
    ) -> Result<Vec<AssetAccess>, ApiError> {
        let response = self
            .post("/internal/assets/access")
            .json(&AssetAccessRequest {
                user_id,
                asset_ids: asset_ids.to_vec(),
            })
            .send()
            .await
            .map_err(upstream_error)?;

        // A failure here is never the end user's fault (for instance a wrong service token), so
        // it is not passed on as a 4xx.
        if !response.status().is_success() {
            return Err(upstream_error(format!(
                "main service answered {}",
                response.status()
            )));
        }

        let body: AssetAccessResponse = response.json().await.map_err(upstream_error)?;
        Ok(body.assets)
    }

    /// The asset, if it exists and is public. Cached for [`PUBLIC_ASSET_TTL`]; concurrent
    /// requests for the same asset share one call to the main service.
    pub async fn public_asset(&self, asset_id: Uuid) -> Result<Option<AssetAccess>, ApiError> {
        self.public_assets
            .try_get_with(asset_id, async {
                let assets = self.readable_assets(None, &[asset_id]).await?;
                Ok::<_, ApiError>(
                    assets
                        .into_iter()
                        .find(|asset| asset.id == asset_id && asset.visibility == AssetVisibility::Public),
                )
            })
            .await
            // The cause was logged when it happened; the shared error cannot be moved out.
            .map_err(|_| ApiError::new(ErrorCode::UpstreamUnavailable))
    }
}

/// `502 UPSTREAM_UNAVAILABLE`; the reason goes to the log only.
fn upstream_error(reason: impl Display) -> ApiError {
    tracing::warn!(%reason, "call to the main service failed");
    ApiError::new(ErrorCode::UpstreamUnavailable)
}

#[cfg(test)]
mod tests {
    use crate::{
        test_support::{MockMain, asset, spawn_mock},
        types::app_state::AppState,
    };

    use super::*;

    fn client_for(mock: &MockMain) -> MainServiceClient {
        MainServiceClient::new(
            &mock.url,
            ServiceAuthState::new(AppState::TEST_SERVICE_TOKEN),
        )
    }

    #[tokio::test]
    async fn readable_assets_sends_the_service_token_and_returns_the_answer() {
        let private = asset(AssetVisibility::Private);
        let mock = spawn_mock(vec![private.clone()], false).await;

        let found = client_for(&mock)
            .readable_assets(Some(Uuid::now_v7()), &[private.id, Uuid::now_v7()])
            .await
            .unwrap();

        assert_eq!(found.len(), 1);
        assert_eq!(found[0].blob_id, private.blob_id);
    }

    #[tokio::test]
    async fn a_wrong_service_token_is_an_upstream_problem_not_a_client_error() {
        let mock = spawn_mock(vec![], false).await;
        let client = MainServiceClient::new(&mock.url, ServiceAuthState::new("another-token"));

        let error = client
            .readable_assets(None, &[Uuid::now_v7()])
            .await
            .unwrap_err();

        assert_eq!(error.code(), &ErrorCode::UpstreamUnavailable);
    }

    #[tokio::test]
    async fn public_asset_only_returns_public_ones() {
        let public = asset(AssetVisibility::Public);
        let private = asset(AssetVisibility::Private);
        let mock = spawn_mock(vec![public.clone(), private.clone()], false).await;
        let client = client_for(&mock);

        assert_eq!(
            client.public_asset(public.id).await.unwrap().unwrap().id,
            public.id
        );
        assert!(client.public_asset(private.id).await.unwrap().is_none());
        assert!(client.public_asset(Uuid::now_v7()).await.unwrap().is_none());
    }

    #[tokio::test]
    async fn public_lookups_are_cached_including_misses() {
        let public = asset(AssetVisibility::Public);
        let mock = spawn_mock(vec![public.clone()], false).await;
        let client = client_for(&mock);
        let unknown = Uuid::now_v7();

        for _ in 0..3 {
            client.public_asset(public.id).await.unwrap();
            client.public_asset(unknown).await.unwrap();
        }

        assert_eq!(mock.calls(), 2, "one call per distinct asset");
    }

    #[tokio::test]
    async fn failures_are_not_cached() {
        let mock = spawn_mock(vec![], true).await;
        let client = client_for(&mock);
        let id = Uuid::now_v7();

        for _ in 0..2 {
            let error = client.public_asset(id).await.unwrap_err();
            assert_eq!(error.code(), &ErrorCode::UpstreamUnavailable);
        }

        assert_eq!(mock.calls(), 2);
    }
}
