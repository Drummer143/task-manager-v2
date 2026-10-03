use std::sync::Arc;

use axum::extract::FromRef;
use sqlx::PgPool;
use utils::service_auth::ServiceAuthState;
pub use utils::auth_middleware::InternalAuthState;

use crate::{entities::files::links::FileLinkConfig, main_client::MainServiceClient};

#[derive(Clone)]
pub struct AppState {
    pub postgres: PgPool,
    pub redis: Arc<deadpool_redis::Pool>,
    pub assets_folder_path: Arc<String>,
    pub temp_folder_path: Arc<String>,
    pub jwt_secret: Arc<String>,
    pub auth: InternalAuthState,
    /// Authenticates `/internal/*` requests and this service's own calls to other services.
    pub service_auth: ServiceAuthState,
    /// Every call to the main service goes through this client.
    pub main: MainServiceClient,
    pub file_links: FileLinkConfig,
    // pub rabbitmq: std::sync::Arc<lapin::Channel>,
}

impl FromRef<AppState> for InternalAuthState {
    fn from_ref(state: &AppState) -> Self {
        state.auth.clone()
    }
}

impl FromRef<AppState> for ServiceAuthState {
    fn from_ref(state: &AppState) -> Self {
        state.service_auth.clone()
    }
}

#[cfg(test)]
impl AppState {
    /// A state that touches no network: the database pool and Redis pool connect lazily, so
    /// handlers that fail before using them can be tested without either.
    pub fn for_tests(main_service_url: &str) -> Self {
        let service_auth = ServiceAuthState::new(Self::TEST_SERVICE_TOKEN);
        Self {
            postgres: sqlx::postgres::PgPoolOptions::new()
                // The database does not exist: fail fast instead of retrying for 30 seconds.
                .acquire_timeout(std::time::Duration::from_millis(300))
                .connect_lazy("postgres://nobody@127.0.0.1:1/none")
                .expect("lazy pool"),
            redis: Arc::new(
                deadpool_redis::Config::from_url("redis://127.0.0.1:1")
                    .create_pool(Some(deadpool_redis::Runtime::Tokio1))
                    .expect("lazy redis pool"),
            ),
            assets_folder_path: Arc::new(String::new()),
            temp_folder_path: Arc::new(String::new()),
            jwt_secret: Arc::new("upload-token-secret".into()),
            auth: InternalAuthState {
                jwks: Arc::new(tokio::sync::RwLock::new(utils::types::jwks::JwkSet {
                    keys: Vec::new(),
                })),
                authentik_jwks_url: Arc::new("http://127.0.0.1:1/jwks".into()),
                authentik_audience: Arc::new("test".into()),
                authentik_issuer: None,
            },
            main: MainServiceClient::new(main_service_url, service_auth.clone()),
            service_auth,
            file_links: FileLinkConfig::new(
                Self::TEST_LINK_SECRET,
                std::time::Duration::from_secs(3600),
                "https://files.test",
            ),
        }
    }

    pub const TEST_SERVICE_TOKEN: &'static str = "test-service-token";
    pub const TEST_LINK_SECRET: &'static str = "0123456789abcdef0123456789abcdef";
}
