use std::sync::Arc;
use std::time::{SystemTime, UNIX_EPOCH};

use tokio_cron_scheduler::{Job, JobScheduler};
use tracing::{error, info};

use crate::{
    redis::transaction::TransactionRepository,
    types::app_state::AppState,
};

pub async fn init_transaction_cleanup_worker(state: Arc<AppState>, cron_expression: &str) -> Result<(), Box<dyn std::error::Error>> {
    let sched = JobScheduler::new().await?;

    let job = Job::new_async(cron_expression, move |_uuid, mut _l| {
        let state_clone = state.clone();
        Box::pin(async move {
            info!("Running transaction cleanup worker...");
            if let Err(e) = run_cleanup(&state_clone).await {
                error!("Error in transaction cleanup worker: {}", e);
            }
            info!("Transaction cleanup worker finished.");
        })
    })?;

    sched.add(job).await?;
    sched.start().await?;

    Ok(())
}

async fn run_cleanup(state: &AppState) -> Result<(), Box<dyn std::error::Error>> {
    let now = SystemTime::now().duration_since(UNIX_EPOCH)?.as_secs() as f64;
    
    // Find all transactions inactive for > 1 hour (3600 seconds)
    let one_hour_ago = now - 3600.0;
    
    let inactive_txs = match TransactionRepository::get_inactive_transactions(&state.redis, one_hour_ago).await {
        Ok(txs) => txs,
        Err(e) => {
            error!("Failed to get inactive transactions: {:?}", e);
            return Err(Box::new(std::io::Error::other(format!("{:?}", e))));
        }
    };

    let twenty_four_hours_ago = now - (24.0 * 3600.0);

    let mut deleted_count = 0;

    for tx_id in inactive_txs {
        // Fetch transaction metadata
        let meta = match TransactionRepository::get(&state.redis, tx_id).await {
            Ok(meta) => meta,
            Err(e) => {
                if !matches!(e, crate::redis::error::RedisError::NotFound) {
                    error!("Error getting metadata for tx {}: {:?}", tx_id, e);
                }
                // If not found, perhaps it was already deleted, so we should clean up ZSET just in case
                let mut conn = state.redis.get().await?;
                let _ = deadpool_redis::redis::AsyncCommands::zrem::<_, _, ()>(&mut conn, "tx_activity", tx_id.to_string()).await;
                continue;
            }
        };

        // Check how many chunks were uploaded
        let uploaded_chunks = match TransactionRepository::get_uploaded_chunks_count(&state.redis, tx_id).await {
            Ok(count) => count,
            Err(e) => {
                error!("Error getting chunk count for tx {}: {:?}", tx_id, e);
                continue;
            }
        };

        let mut should_delete = false;

        if uploaded_chunks == 0 {
            // Delete if no chunks uploaded and inactive > 1 hour (already passed this check)
            should_delete = true;
        } else {
            // Delete if some chunks uploaded but inactive > 24 hours
            let mut conn = state.redis.get().await?;
            let score: Option<f64> = deadpool_redis::redis::AsyncCommands::zscore(&mut conn, "tx_activity", tx_id.to_string()).await?;
            if let Some(s) = score
                && s < twenty_four_hours_ago
            {
                should_delete = true;
            }
        }

        if should_delete {
            // Remove temp file
            if let crate::redis::transaction::TransactionType::ChunkedUpload { path_to_file }
                | crate::redis::transaction::TransactionType::WholeFileUpload { path_to_file } = meta.transaction_type
                && let Err(e) = tokio::fs::remove_file(&path_to_file).await
                && e.kind() != std::io::ErrorKind::NotFound
            {
                error!("Failed to remove temp file {} for tx {}: {}", path_to_file, tx_id, e);
            }

            // Remove from Redis
            if let Err(e) = TransactionRepository::delete(&state.redis, tx_id).await {
                error!("Failed to delete tx {} from Redis: {:?}", tx_id, e);
            } else {
                deleted_count += 1;
            }
        }
    }
    
    if deleted_count > 0 {
        info!("Deleted {} inactive transactions.", deleted_count);
    }

    Ok(())
}
