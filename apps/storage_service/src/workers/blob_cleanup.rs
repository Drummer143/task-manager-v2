use std::sync::Arc;
use serde::{Deserialize, Serialize};
use tokio_cron_scheduler::{Job, JobScheduler};
use tracing::{error, info};

use crate::{
    db::blobs::BlobsRepository,
    types::app_state::AppState,
};

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct CheckBlobsDto {
    blob_ids: Vec<String>,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct CheckBlobsResponse {
    existing_blob_ids: Vec<String>,
}

pub async fn init_blob_cleanup_worker(state: Arc<AppState>, cron_expression: &str) -> Result<(), Box<dyn std::error::Error>> {
    let sched = JobScheduler::new().await?;

    let job = Job::new_async(cron_expression, move |_uuid, mut _l| {
        let state_clone = state.clone();
        Box::pin(async move {
            info!("Running unused blobs cleanup worker...");
            if let Err(e) = run_blob_cleanup(&state_clone).await {
                error!("Error in blob cleanup worker: {}", e);
            }
            info!("Blob cleanup worker finished.");
        })
    })?;

    sched.add(job).await?;
    sched.start().await?;

    Ok(())
}

async fn run_blob_cleanup(state: &AppState) -> Result<(), Box<dyn std::error::Error>> {
    let mut offset = 0;
    let limit = 1000;
    let mut total_deleted = 0;

    let client = reqwest::Client::new();
    let main_service_url = &state.main_service_url;

    loop {
        let blob_ids = BlobsRepository::get_all_blob_ids(&state.postgres, limit, offset)
            .await
            .map_err(|e| Box::new(std::io::Error::other(format!("{:?}", e))))?;

        if blob_ids.is_empty() {
            break;
        }

        let blob_ids_str: Vec<String> = blob_ids.iter().map(|id| id.to_string()).collect();

        // Check with main service
        let response = match client.post(format!("{}/internal/assets/check-blobs", main_service_url))
            .json(&CheckBlobsDto { blob_ids: blob_ids_str })
            .send()
            .await {
                Ok(resp) => resp,
                Err(e) => {
                    error!("Failed to check blobs with main service: {}", e);
                    break; // Abort cleanup on network error to be safe
                }
            };

        if !response.status().is_success() {
            error!("Failed to check blobs with main service, status: {}", response.status());
            break; // Abort cleanup on API error
        }

        let check_response: CheckBlobsResponse = match response.json().await {
            Ok(json) => json,
            Err(e) => {
                error!("Failed to parse check blobs response: {}", e);
                break;
            }
        };

        let existing_ids_set: std::collections::HashSet<String> = check_response.existing_blob_ids.into_iter().collect();

        let mut to_delete = Vec::new();
        for id in blob_ids.iter() {
            if !existing_ids_set.contains(&id.to_string()) {
                to_delete.push(*id);
            }
        }

        if !to_delete.is_empty() {
            let deleted_blobs = BlobsRepository::delete_blobs(&state.postgres, &to_delete)
                .await
                .map_err(|e| Box::new(std::io::Error::other(format!("{:?}", e))))?;

            for blob in deleted_blobs {
                // Delete physical file
                if let Err(e) = tokio::fs::remove_file(&blob.path).await
                    && e.kind() != std::io::ErrorKind::NotFound
                {
                    error!("Failed to delete file {} for blob {}: {}", blob.path, blob.id, e);
                }
                total_deleted += 1;
            }
        }

        if blob_ids.len() < limit as usize {
            break;
        }

        offset += limit;
    }

    if total_deleted > 0 {
        info!("Deleted {} unused blobs.", total_deleted);
    }

    Ok(())
}
