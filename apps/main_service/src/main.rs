mod config;
mod me;
mod repos;
mod webhooks;

use anyhow::Context;
use axum::{
    Router,
    http::{Method, header},
};
use sqlx::postgres::PgPoolOptions;
use std::sync::Arc;
use tokio::net::TcpListener;
use tower_http::cors::{AllowOrigin, CorsLayer};
use tracing_subscriber::EnvFilter;

use utils::{
    auth_middleware::InternalAuthState, service_auth::ServiceAuthState, types::jwks::JwkSet,
};

use crate::config::Config;

#[tokio::main]
async fn main() -> anyhow::Result<()> {
    tracing_subscriber::fmt()
        .with_env_filter(
            // Postgres notices (e.g. "_sqlx_migrations already exists") are noise at info level
            EnvFilter::try_from_default_env()
                .unwrap_or_else(|_| EnvFilter::new("info,sqlx::postgres::notice=warn")),
        )
        .init();

    let config = Config::from_env()?;

    let pool = PgPoolOptions::new()
        .max_connections(config.database_max_connections)
        .connect(&config.database_url)
        .await
        .context("failed to connect to the database")?;

    // Migrations live in ./migrations and are embedded into the binary
    if config.run_migrations {
        sqlx::migrate!()
            .run(&pool)
            .await
            .context("failed to run database migrations")?;
        tracing::info!("database migrations applied");
    } else {
        tracing::warn!("RUN_MIGRATIONS=false: the database schema is left as it is");
    }

    // The frontend calls the API from another origin; tokens travel in `Authorization`
    let cors = CorsLayer::new()
        .allow_origin(AllowOrigin::list(config.cors_origins.clone()))
        .allow_methods([
            Method::GET,
            Method::POST,
            Method::PUT,
            Method::PATCH,
            Method::DELETE,
        ])
        .allow_headers([
            header::CONTENT_TYPE,
            header::AUTHORIZATION,
            header::ACCEPT,
            error_handlers::trace::REQUEST_ID_HEADER,
        ])
        // The frontend shows it next to errors, so people can quote it
        .expose_headers([error_handlers::trace::REQUEST_ID_HEADER]);

    // Keys are fetched on the first token with an unknown key id, so a slow authentik does not
    // keep the service from starting
    let auth = InternalAuthState {
        jwks: Arc::new(tokio::sync::RwLock::new(JwkSet { keys: Vec::new() })),
        authentik_jwks_url: Arc::new(config.authentik_jwks_url.clone()),
        authentik_audience: Arc::new(config.authentik_audience.clone()),
        authentik_issuer: config.authentik_issuer.clone().map(Arc::new),
    };

    let app = Router::new()
        .merge(me::router(auth))
        .merge(webhooks::authentik::router(ServiceAuthState::new(
            config.user_sync_webhook_token.clone(),
        )))
        .fallback(error_handlers::fallback::not_found)
        .method_not_allowed_fallback(error_handlers::fallback::method_not_allowed)
        .with_state(pool)
        .layer(cors)
        // Last, so it wraps everything: every response carries the id the logs use
        .layer(axum::middleware::from_fn(error_handlers::trace::request_id));

    let listener = TcpListener::bind(config.addr)
        .await
        .with_context(|| format!("failed to bind {}", config.addr))?;
    tracing::info!("listening on {}", config.addr);

    axum::serve(listener, app)
        .with_graceful_shutdown(shutdown_signal())
        .await
        .context("server error")?;

    Ok(())
}

/// Resolves on Ctrl+C or, on Unix, SIGTERM (what `docker stop` sends).
async fn shutdown_signal() {
    let ctrl_c = async {
        tokio::signal::ctrl_c()
            .await
            .expect("failed to install Ctrl+C handler");
    };

    #[cfg(unix)]
    let terminate = async {
        tokio::signal::unix::signal(tokio::signal::unix::SignalKind::terminate())
            .expect("failed to install SIGTERM handler")
            .recv()
            .await;
    };

    #[cfg(not(unix))]
    let terminate = std::future::pending::<()>();

    tokio::select! {
        () = ctrl_c => {},
        () = terminate => {},
    }

    tracing::info!("shutting down");
}
