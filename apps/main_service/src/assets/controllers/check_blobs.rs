use axum::{Json, extract::State};
use error_handlers::{ApiError, extract::ApiJson};
use serde::{Deserialize, Serialize};
use uuid::Uuid;

use crate::assets::repo::AssetsRepository;

/// `storage::workers::blob_cleanup::CheckBlobsDto`.
#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CheckBlobsRequest {
    blob_ids: Vec<Uuid>,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CheckBlobsResponse {
    /// The blobs an asset still uses; storage deletes the others.
    existing_blob_ids: Vec<Uuid>,
}

/// `POST /internal/assets/check-blobs`: which of these blobs are still needed.
pub async fn check_blobs(
    State(pool): State<sqlx::PgPool>,
    ApiJson(body): ApiJson<CheckBlobsRequest>,
) -> Result<Json<CheckBlobsResponse>, ApiError> {
    let existing_blob_ids = AssetsRepository::used_blobs(&pool, &body.blob_ids).await?;

    Ok(Json(CheckBlobsResponse { existing_blob_ids }))
}
