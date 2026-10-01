use axum::{Extension, Json, extract::State};
use error_handlers::{
    ApiError,
    extract::{ApiJson, ApiPath},
};
use uuid::Uuid;

use crate::{
    entities::actions::{
        dto::{UploadSuccessResponse, UploadVerifyDto},
        service::ActionsService,
    },
    errors::UploadVerifyErrors,
    types::app_state::AppState,
};

#[utoipa::path(
    post,
    path = "/actions/upload/{transaction_id}/verify",
    params(
        ("transaction_id" = Uuid, Path, description = "Transaction ID"),
    ),
    request_body = UploadVerifyDto,
    responses(
        (status = 200, description = "Verification result", body = UploadSuccessResponse),
        UploadVerifyErrors,
    ),
    tags = ["Upload file"],
)]
pub async fn upload_verify(
    State(state): State<AppState>,
    Extension(user_id): Extension<Uuid>,
    ApiPath(transaction_id): ApiPath<Uuid>,
    ApiJson(body): ApiJson<UploadVerifyDto>,
) -> Result<Json<UploadSuccessResponse>, ApiError> {
    ActionsService::upload_verify(&state, user_id, transaction_id, body)
        .await
        .map(Json)
}
