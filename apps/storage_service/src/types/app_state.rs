use std::sync::Arc;

use axum::extract::FromRef;
use sqlx::PgPool;
pub use utils::auth_middleware::InternalAuthState;

#[derive(Clone)]
pub struct AppState {
    pub postgres: PgPool,
    pub redis: Arc<deadpool_redis::Pool>,
    pub assets_folder_path: Arc<String>,
    pub temp_folder_path: Arc<String>,
    pub jwt_secret: Arc<String>,
    pub main_service_url: Arc<String>,
    pub auth: InternalAuthState,
    // pub rabbitmq: std::sync::Arc<lapin::Channel>,
}

impl FromRef<AppState> for InternalAuthState {
    fn from_ref(state: &AppState) -> Self {
        state.auth.clone()
    }
}
