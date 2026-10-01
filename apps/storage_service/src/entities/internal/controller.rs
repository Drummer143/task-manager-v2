use axum::{
    Json,
    extract::{Multipart, State, multipart::MultipartRejection},
    http::StatusCode,
};
use error_handlers::{ApiError, ErrorCode, FieldError};
use sql_models::blobs::model::Blob;
use tokio::io::AsyncWriteExt;

use crate::{
    db::blobs::{BlobsRepository, CreateBlobDto},
    entities::actions::{service::ActionsService, shared::build_path_to_assets_file},
    errors::{InternalUploadErrors, db_error},
    types::app_state::AppState,
};

#[utoipa::path(
    post,
    path = "/internal/upload",
    request_body(
        content_type = "multipart/form-data",
    ),
    responses(
        (status = 201, description = "File uploaded successfully", body = Blob),
        InternalUploadErrors,
    ),
    tags = ["Internal"],
)]
pub async fn upload(
    State(state): State<AppState>,
    multipart: Result<Multipart, MultipartRejection>,
) -> Result<(StatusCode, Json<Blob>), ApiError> {
    let mut multipart = multipart.map_err(|e| {
        let code = match e.status() {
            StatusCode::UNSUPPORTED_MEDIA_TYPE => ErrorCode::UnsupportedMediaType,
            _ => ErrorCode::MalformedRequest,
        };
        ApiError::new(code).with_source(e)
    })?;
    let mut file_bytes: Option<Vec<u8>> = None;
    let mut filename: Option<String> = None;

    while let Some(field) = multipart
        .next_field()
        .await
        .map_err(|e| ApiError::new(ErrorCode::MalformedRequest).with_source(e))?
    {
        let field_name = field.name().unwrap_or_default();

        if field_name == "file" {
            filename = field.file_name().map(|s| s.to_string());

            let bytes = field
                .bytes()
                .await
                .map_err(|e| ApiError::new(ErrorCode::MalformedRequest).with_source(e))?;

            file_bytes = Some(bytes.to_vec());
        }
    }

    let bytes = file_bytes
        .ok_or_else(|| ApiError::validation(vec![FieldError::new("file", ErrorCode::Required)]))?;

    let filename = filename.unwrap_or_else(|| "unknown".to_string());
    let hash = blake3::hash(&bytes).to_string();
    let size = bytes.len() as u64;

    // Deduplication: return existing blob if hash matches
    match BlobsRepository::get_one_by_hash(&state.postgres, &hash).await {
        Ok(blob) => return Ok((StatusCode::CREATED, Json(blob))),
        Err(sqlx::Error::RowNotFound) => {}
        Err(e) => return Err(db_error(e)),
    }

    let mime_type = ActionsService::detect_mime_type(&bytes, &filename);
    let path_to_file = build_path_to_assets_file(&state.assets_folder_path, &hash, size);

    let mut file = tokio::fs::OpenOptions::new()
        .create(true)
        .truncate(true)
        .write(true)
        .open(&path_to_file)
        .await
        .map_err(ApiError::internal)?;

    file.write_all(&bytes).await.map_err(ApiError::internal)?;

    let blob = BlobsRepository::create(
        &state.postgres,
        CreateBlobDto {
            hash,
            size: size as i64,
            path: path_to_file,
            mime_type,
        },
    )
    .await
    .map_err(db_error)?;

    Ok((StatusCode::CREATED, Json(blob)))
}
