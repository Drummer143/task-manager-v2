use axum::{Extension, extract::State};
use axum_extra::{TypedHeader, typed_header::TypedHeaderRejection};
use error_handlers::{
    ApiError, ErrorCode,
    extract::{ApiBytes, ApiPath},
};
use uuid::Uuid;

use crate::{
    entities::actions::service::ActionsService, errors::UploadChunkErrors,
    types::app_state::AppState,
};

#[utoipa::path(
    post,
    path = "/actions/upload/{transaction_id}/chunk",
    params(
        ("transaction_id" = Uuid, Path, description = "Transaction id"),
        ("Content-Range" = String, Header, description = "Format: bytes start-end/total (e.g. bytes 0-1024/5000)"),
        ("Content-Type" = String, Header, example = "application/octet-stream")
    ),
    request_body(
        content = Vec<u8>,
        content_type = "application/octet-stream",
    ),
    responses(
        (status = 201, description = "File uploaded successfully"),
        UploadChunkErrors,
    ),
    tags = ["Upload file"],
)]
pub async fn upload_chunk(
    State(state): State<AppState>,
    Extension(user_id): Extension<Uuid>,
    content_range: Result<TypedHeader<axum_extra::headers::ContentRange>, TypedHeaderRejection>,
    ApiPath(transaction_id): ApiPath<Uuid>,
    ApiBytes(body): ApiBytes,
) -> Result<(), ApiError> {
    let TypedHeader(content_range) =
        content_range.map_err(|e| ApiError::new(ErrorCode::MalformedRequest).with_source(e))?;

    let bytes_range = content_range.bytes_range().ok_or_else(|| {
        ApiError::new(ErrorCode::MalformedRequest).with_source("Content-Range has no bytes range")
    })?;

    ActionsService::upload_chunk(&state, user_id, transaction_id, bytes_range, body).await
}
