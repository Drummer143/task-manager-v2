use axum::{Json, extract::State};
use error_handlers::{ApiError, extract::ApiPath};
use uuid::Uuid;

use crate::{
    entities::actions::{dto::UploadSuccessResponse, service::ActionsService},
    errors::UploadCompleteErrors,
    types::app_state::AppState,
};

#[utoipa::path(
    post,
    path = "/actions/upload/{transaction_id}/complete",
    params(
        ("transaction_id" = Uuid, Path, description = "Transaction ID"),
    ),
    responses(
        (status = 200, description = "Upload completion result", body = UploadSuccessResponse),
        UploadCompleteErrors,
    ),
    tags = ["Upload file"],
)]
pub async fn upload_complete(
    State(state): State<AppState>,
    ApiPath(transaction_id): ApiPath<Uuid>,
) -> Result<Json<UploadSuccessResponse>, ApiError> {
    ActionsService::upload_complete(&state, transaction_id)
        .await
        .map(Json)
}
