use std::sync::Arc;

use axum::http;
use types::app_state::InternalAuthState;
use utils::types::jwks::JwkSet;
use utoipa::OpenApi;

pub mod db;
pub mod db_connections;
pub mod entities;
pub mod errors;
pub mod main_client;
pub mod redis;
pub mod swagger;
#[cfg(test)]
mod test_support;
#[cfg(test)]
mod access_tests;
pub mod types;
pub mod workers;

pub fn openapi_json() -> String {
    serde_json::to_string_pretty(&swagger::ApiDoc::openapi()).unwrap()
}

pub async fn build() -> axum::Router {
    let cors_origins: Vec<http::HeaderValue> = std::env::var("CORS_ORIGINS")
        .unwrap_or_else(|_| "http://localhost:1346,http://localhost:80".to_string())
        .split(',')
        .filter_map(|s| s.trim().parse().ok())
        .collect();

    let cors = tower_http::cors::CorsLayer::new()
        .allow_origin(tower_http::cors::AllowOrigin::list(cors_origins))
        .allow_methods([
            http::Method::GET,
            http::Method::POST,
            http::Method::OPTIONS,
            http::Method::PUT,
            http::Method::DELETE,
            http::Method::PATCH,
            http::Method::OPTIONS,
        ])
        .allow_headers([
            http::header::CONTENT_TYPE,
            http::header::AUTHORIZATION,
            http::header::ACCEPT,
            http::header::RANGE,
            http::header::CONTENT_RANGE,
            error_handlers::trace::REQUEST_ID_HEADER,
        ])
        .expose_headers([
            http::header::CONTENT_RANGE,
            http::header::CONTENT_LENGTH,
            http::header::ACCEPT_RANGES,
            error_handlers::trace::REQUEST_ID_HEADER,
        ])
        .allow_credentials(true);

    let (db, redis) = db_connections::init_databases(
        &std::env::var("DATABASE_URL").expect("DATABASE_URL not found"),
        &std::env::var("REDIS_URL").expect("REDIS_URL not found"),
    )
    .await;

    // The schema (including `blobs`) is migrated by main_service, the only service that owns
    // migrations; storage expects the database to be up to date when it starts.

    let static_folder_path = std::path::PathBuf::from(
        std::env::var("STATIC_FOLDER_PATH").expect("STATIC_FOLDER_PATH not found"),
    );

    let jwt_secret = std::env::var("JWT_SECRET").expect("JWT_SECRET not found");

    let main_service_url = std::env::var("MAIN_SERVICE_URL").expect("MAIN_SERVICE_URL not found");

    // One secret for calls in both directions between backend services; guards `/internal/*`.
    let service_auth = utils::service_auth::ServiceAuthState::new(
        std::env::var("INTERNAL_SERVICE_TOKEN").expect("INTERNAL_SERVICE_TOKEN not found"),
    );

    // Signs private file links; only this service knows it. At least 32 bytes.
    let file_links = entities::files::links::FileLinkConfig::new(
        &std::env::var("FILE_LINK_SECRET").expect("FILE_LINK_SECRET not found"),
        std::time::Duration::from_secs(
            std::env::var("FILE_LINK_TTL_SECONDS")
                .ok()
                .and_then(|value| value.parse().ok())
                .unwrap_or(3600),
        ),
        // Where browsers reach this service, e.g. https://example.com/storage
        &std::env::var("STORAGE_PUBLIC_URL").expect("STORAGE_PUBLIC_URL not found"),
    );

    let jwks_url = std::env::var("AUTHENTIK_JWKS_URL").expect("AUTHENTIK_JWKS_URL must be set");
    let authentik_audience =
        std::env::var("AUTHENTIK_AUDIENCE").expect("AUTHENTIK_AUDIENCE must be set");

    let jwks = reqwest::get(&jwks_url)
        .await
        .expect("Failed to fetch JWKS")
        .json::<JwkSet>()
        .await
        .expect("Failed to parse JWKS");

    let auth = InternalAuthState {
        jwks: Arc::new(tokio::sync::RwLock::new(jwks)),
        authentik_jwks_url: Arc::new(jwks_url),
        authentik_audience: Arc::new(authentik_audience),
        // Optional: without it any token signed by this authentik with the right audience passes
        authentik_issuer: std::env::var("AUTHENTIK_ISSUER")
            .ok()
            .filter(|issuer| !issuer.is_empty())
            .map(Arc::new),
    };

    let assets_folder_path = static_folder_path.join("assets");
    let temp_folder_path = static_folder_path.join("temp");

    if !assets_folder_path.exists() {
        std::fs::create_dir_all(&assets_folder_path).expect("Failed to create assets folder");
    }

    if !temp_folder_path.exists() {
        std::fs::create_dir_all(&temp_folder_path).expect("Failed to create temp folder");
    }

    let app_state = types::app_state::AppState {
        postgres: db,
        redis: Arc::new(redis),
        assets_folder_path: Arc::new(assets_folder_path.to_str().unwrap().to_string()),
        temp_folder_path: Arc::new(temp_folder_path.to_str().unwrap().to_string()),
        jwt_secret: Arc::new(jwt_secret),
        auth,
        main: main_client::MainServiceClient::new(&main_service_url, service_auth.clone()),
        service_auth,
        file_links,
    };

    // Off when running against shared databases (the SSH tunnel to the VPS): the cleanups delete
    // transactions and blobs, and those belong to the deployed storage-service
    let run_background_workers = std::env::var("RUN_BACKGROUND_WORKERS")
        .map(|value| value != "false")
        .unwrap_or(true);

    if run_background_workers {
        let arc_state = Arc::new(app_state.clone());

        let transaction_cleanup_cron = std::env::var("TRANSACTION_CLEANUP_CRON")
            .unwrap_or_else(|_| "0 1/5 * * * *".to_string());

        let blob_cleanup_cron =
            std::env::var("BLOB_CLEANUP_CRON").unwrap_or_else(|_| "0 0 3 * * * *".to_string());

        workers::transaction_cleanup::init_transaction_cleanup_worker(
            arc_state.clone(),
            &transaction_cleanup_cron,
        )
        .await
        .expect("Failed to init transaction cleanup worker");

        workers::blob_cleanup::init_blob_cleanup_worker(arc_state, &blob_cleanup_cron)
            .await
            .expect("Failed to init blob cleanup worker");
    } else {
        tracing::warn!("RUN_BACKGROUND_WORKERS=false: cleanup workers are not started");
    }

    let app = axum::Router::new()
        .merge(entities::actions::router::init(app_state.clone()))
        .merge(entities::files::router::init(app_state.clone()))
        .merge(entities::internal::router::init(app_state.clone()))
        .merge(
            utoipa_swagger_ui::SwaggerUi::new("/api")
                .url("/api/openapi.json", swagger::ApiDoc::openapi()),
        )
        .fallback(error_handlers::fallback::not_found)
        .method_not_allowed_fallback(error_handlers::fallback::method_not_allowed)
        .with_state(app_state);

    // No `request_timeout` here on purpose: chunk and whole-file uploads legitimately take long.
    // Layers added later wrap the earlier ones, so `request_id` goes last to cover everything.
    error_handlers::guard::catch_panics(app)
        .layer(tower_http::trace::TraceLayer::new_for_http())
        .layer(cors)
        .layer(axum::middleware::from_fn(error_handlers::trace::request_id))
}
