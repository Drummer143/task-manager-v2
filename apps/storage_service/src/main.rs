use mimalloc::MiMalloc;
use utils::shutdown_signal::shutdown_signal;

#[global_allocator]
static GLOBAL: MiMalloc = MiMalloc;

#[tokio::main]
async fn main() {
    let _ = dotenvy::dotenv();

    use tracing_subscriber::{EnvFilter, layer::SubscriberExt, util::SubscriberInitExt};

    tracing_subscriber::registry()
        // RUST_LOG overrides it, e.g. RUST_LOG=debug while investigating
        .with(
            EnvFilter::try_from_default_env()
                .unwrap_or_else(|_| EnvFilter::new("info,lapin=warn,sqlx=warn")),
        )
        .with(tracing_subscriber::fmt::layer())
        .init();

    let addr = "0.0.0.0:8082";

    let app = storage_app::build().await;

    println!("Listening on {}", addr);
    tracing::info!("Listening on {}", addr);

    let listener = tokio::net::TcpListener::bind(addr).await.unwrap();

    axum::serve(listener, app)
        .with_graceful_shutdown(shutdown_signal())
        .await
        .expect("Failed to start server");
}
