use axum::{Json, extract::State};
use chrono::{DateTime, Utc};
use error_handlers::{ApiError, ErrorCode, FieldError, extract::ApiJson};
use serde::{Deserialize, Serialize};
use sql_models::{
    asset::model::{Asset, AssetStatus},
    blobs::model::Blob,
};
use uuid::Uuid;

use crate::assets::{owner::Owner, repo::AssetsRepository, upload_token::UploadTokenKey};

/// Sent by storage when an upload is done, or when the file was already stored and the uploader
/// proved they have it (`storage::entities::actions::service::fetch_create_asset`).
#[derive(Deserialize)]
pub struct CompleteUploadRequest {
    /// The upload token the client started the upload with.
    token: String,
    /// The stored content.
    blob: Blob,
}

/// `storage::entities::actions::dto::AssetResponse`, returned to the uploader as is.
#[derive(Debug, Serialize)]
pub struct CompletedAsset {
    id: Uuid,
    name: String,
    created_at: DateTime<Utc>,
}

/// `POST /internal/assets/complete`: backs the pending asset of the token with the blob.
pub async fn complete_upload(
    State(pool): State<sqlx::PgPool>,
    State(tokens): State<UploadTokenKey>,
    ApiJson(body): ApiJson<CompleteUploadRequest>,
) -> Result<Json<CompletedAsset>, ApiError> {
    let claims = tokens.verify(&body.token)?;

    let asset = AssetsRepository::get(&pool, claims.sub)
        .await?
        // Cleaned up as abandoned, or never created
        .ok_or_else(|| ApiError::new(ErrorCode::NotFound))?;

    if asset.created_by != Some(claims.user_id) {
        return Err(ApiError::new(ErrorCode::UploadTokenInvalid)
            .with_source("the token was issued to someone else than the asset's creator"));
    }

    if asset.status == AssetStatus::Ready {
        // storage retried after a lost response: the same blob is the same answer
        return if asset.blob_id == Some(body.blob.id) {
            Ok(Json(completed(asset)))
        } else {
            Err(ApiError::new(ErrorCode::Conflict))
        };
    }

    check_matches(&asset, &body.blob)?;

    let asset = AssetsRepository::complete(&pool, asset.id, body.blob.id)
        .await?
        // Completed by a concurrent request in between
        .ok_or_else(|| ApiError::new(ErrorCode::Conflict))?;

    Ok(Json(completed(asset)))
}

/// The blob must be the file the asset was allowed for, and a file its owner accepts.
fn check_matches(asset: &Asset, blob: &Blob) -> Result<(), ApiError> {
    if blob.hash != asset.hash {
        return Err(ApiError::new(ErrorCode::FileHashMismatch));
    }

    if blob.size != asset.size {
        return Err(ApiError::new(ErrorCode::FileSizeMismatch {
            expected_bytes: asset.size as u64,
            actual_bytes: blob.size as u64,
        }));
    }

    let owner = Owner {
        kind: asset.owner_type,
        id: asset.owner_id,
    };
    if !owner.accepts(&blob.mime_type) {
        return Err(ApiError::validation(vec![FieldError::new(
            "file",
            ErrorCode::InvalidFormat,
        )]));
    }

    Ok(())
}

fn completed(asset: Asset) -> CompletedAsset {
    CompletedAsset {
        id: asset.id,
        name: asset.name,
        created_at: asset.created_at,
    }
}

#[cfg(test)]
mod tests {
    use sql_models::asset::model::{AssetOwnerType, AssetVisibility};

    use super::*;

    const HASH: &str = "af1349b9f5f9a1a6a0404dea36dcc9499bcb25c9adc112b7cc9a93cae41f3262";

    fn asset() -> Asset {
        Asset {
            id: Uuid::now_v7(),
            workspace_id: None,
            owner_type: AssetOwnerType::WorkspaceIcon,
            owner_id: Uuid::now_v7(),
            name: "icon.png".into(),
            size: 10,
            hash: HASH.into(),
            blob_id: None,
            status: AssetStatus::Pending,
            visibility: AssetVisibility::Public,
            created_by: None,
            created_at: Utc::now(),
            updated_at: Utc::now(),
        }
    }

    fn blob(hash: &str, size: i64, mime_type: &str) -> Blob {
        Blob {
            id: Uuid::now_v7(),
            hash: hash.into(),
            size,
            path: "/static/x".into(),
            mime_type: mime_type.into(),
            created_at: Utc::now(),
        }
    }

    #[test]
    fn accepts_the_announced_file() {
        assert!(check_matches(&asset(), &blob(HASH, 10, "image/png")).is_ok());
    }

    #[test]
    fn refuses_another_file() {
        let other = "0".repeat(64);

        let error = check_matches(&asset(), &blob(&other, 10, "image/png")).unwrap_err();
        assert_eq!(error.code(), &ErrorCode::FileHashMismatch);

        let error = check_matches(&asset(), &blob(HASH, 11, "image/png")).unwrap_err();
        assert_eq!(
            error.code(),
            &ErrorCode::FileSizeMismatch {
                expected_bytes: 10,
                actual_bytes: 11
            }
        );
    }

    #[test]
    fn refuses_a_type_the_owner_does_not_take() {
        let error = check_matches(&asset(), &blob(HASH, 10, "application/pdf")).unwrap_err();

        assert_eq!(error.code(), &ErrorCode::ValidationFailed);
    }
}
