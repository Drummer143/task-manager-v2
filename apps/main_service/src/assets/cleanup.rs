//! Uploads that were allowed but never finished are removed after a day (backend spec §4.4). Their
//! blobs, if storage kept any, go with storage's own cleanup once no asset uses them.

use std::time::Duration;

use crate::assets::repo::AssetsRepository;

/// How long a pending asset may wait for its file. The upload token lives as long.
pub const ABANDONED_AFTER_HOURS: i32 = 24;

const EVERY: Duration = Duration::from_secs(60 * 60);

/// Runs for the life of the process, first right away.
pub fn spawn(pool: sqlx::PgPool) {
    tokio::spawn(async move {
        let mut tick = tokio::time::interval(EVERY);
        loop {
            tick.tick().await;
            match AssetsRepository::delete_abandoned(&pool, ABANDONED_AFTER_HOURS).await {
                Ok(0) => {}
                Ok(removed) => tracing::info!(removed, "abandoned uploads removed"),
                Err(error) => tracing::warn!(%error, "removing abandoned uploads failed"),
            }
        }
    });
}
