use mimalloc::MiMalloc;
use utils::shutdown_signal::shutdown_signal;

#[global_allocator]
static GLOBAL: MiMalloc = MiMalloc;

#[tokio::main]
async fn main() {
    let _ = dotenvy::dotenv();

    use tracing_subscriber::{EnvFilter, layer::SubscriberExt, util::SubscriberInitExt};

    tracing_subscriber::registry()
        .with(EnvFilter::new("debug,lapin=warn,sqlx=warn"))
        .with(tracing_subscriber::fmt::layer())
        .init();

    let port = std::env::var("SELF_PORT").unwrap_or("3000".to_string());
    let addr = format!("0.0.0.0:{}", port);

    let app = storage_app::build().await;

    println!("Listening on {}", addr);
    tracing::info!("Listening on {}", addr);

    let listener = tokio::net::TcpListener::bind(addr).await.unwrap();

    axum::serve(listener, app)
        .with_graceful_shutdown(shutdown_signal())
        .await
        .expect("Failed to start server");
}
