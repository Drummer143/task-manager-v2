use axum::{Extension, Json, extract::State};
use error_handlers::{
    ApiError,
    extract::{ApiBytes, ApiPath},
};
use uuid::Uuid;

use crate::{
    entities::actions::{dto::UploadSuccessResponse, service::ActionsService},
    errors::UploadWholeFileErrors,
    types::app_state::AppState,
};

#[utoipa::path(
    post,
    path = "/actions/upload/{transaction_id}/whole-file",
    params(
        ("transaction_id" = Uuid, Path, description = "Transaction ID"),
    ),
    request_body(
        content = Vec<u8>,
        content_type = "application/octet-stream"
    ),
    responses(
        (status = 201, description = "File uploaded successfully", body = UploadSuccessResponse),
        UploadWholeFileErrors,
    ),
    tags = ["Upload file"],
)]
pub async fn upload_whole_file(
    State(state): State<AppState>,
    Extension(user_id): Extension<Uuid>,
    ApiPath(transaction_id): ApiPath<Uuid>,
    ApiBytes(body): ApiBytes,
) -> Result<Json<UploadSuccessResponse>, ApiError> {
    ActionsService::upload_whole_file(&state, user_id, transaction_id, body)
        .await
        .map(Json)
}
