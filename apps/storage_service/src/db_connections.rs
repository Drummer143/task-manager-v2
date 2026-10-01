use sqlx::{PgPool, postgres::PgPoolOptions};

pub async fn init_databases(
    postgres_url: &str,
    redis_url: &str,
    // rabbitmq_url: &str,
) -> (PgPool, deadpool_redis::Pool) {
    let db = PgPoolOptions::new()
        .max_connections(5)
        .connect(postgres_url)
        .await
        .expect("Failed to connect to Postgres");

    let redis = deadpool_redis::Config::from_url(redis_url)
        .create_pool(Some(deadpool_redis::Runtime::Tokio1))
        .expect("Failed to connect to Redis");

    // let rabbitmq = lapin::Connection::connect(rabbitmq_url, lapin::ConnectionProperties::default())
    //     .await
    //     .expect("Failed to connect to RabbitMQ");

    // let channel = rabbitmq
    //     .create_channel()
    //     .await
    //     .expect("Failed to create channel");

    // let mut queue_options = lapin::options::QueueDeclareOptions::default();
    // queue_options.durable = true;

    // channel
    //     .queue_declare(
    //         "refresh_signals",
    //         queue_options,
    //         lapin::types::FieldTable::default(),
    //     )
    //     .await
    //     .expect("Failed to declare queue");

    (db, redis)
}
