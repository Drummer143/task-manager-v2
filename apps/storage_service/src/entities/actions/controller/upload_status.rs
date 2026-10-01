use crate::{
    entities::actions::{dto::UploadStatusResponse, service::ActionsService},
    errors::UploadTransactionErrors,
    types::app_state::AppState,
};
use axum::{Json, extract::State};
use error_handlers::{ApiError, extract::ApiPath};
use uuid::Uuid;

#[utoipa::path(
    get,
    path = "/actions/upload/{transaction_id}/status",
    params(
        ("transaction_id" = Uuid, Path, description = "Transaction ID"),
    ),
    responses(
        (status = 200, description = "Upload status", body = UploadStatusResponse),
        UploadTransactionErrors,
    ),
    tags = ["Upload file"],
)]
pub async fn upload_status(
    State(state): State<AppState>,
    ApiPath(transaction_id): ApiPath<Uuid>,
) -> Result<Json<UploadStatusResponse>, ApiError> {
    ActionsService::upload_status(&state, transaction_id)
        .await
        .map(Json)
}
