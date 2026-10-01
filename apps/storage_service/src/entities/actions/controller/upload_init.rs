use axum::{Extension, Json, extract::State};
use error_handlers::{ApiError, extract::ApiJson};
use uuid::Uuid;

use crate::{
    entities::actions::{
        dto::{UploadInitDto, UploadInitResponse},
        service::ActionsService,
    },
    errors::UploadInitErrors,
    types::app_state::AppState,
};

#[utoipa::path(
    post,
    path = "/actions/upload/init",
    request_body = UploadInitDto,
    responses(
        (status = 200, description = "Upload chunked init", body = UploadInitResponse),
        UploadInitErrors,
    ),
    tags = ["Upload file"],
)]
#[axum::debug_handler]
pub async fn upload_init(
    State(state): State<AppState>,
    Extension(user_id): Extension<Uuid>,
    ApiJson(body): ApiJson<UploadInitDto>,
) -> Result<Json<UploadInitResponse>, ApiError> {
    ActionsService::upload_init(&state, user_id, body)
        .await
        .map(Json)
}
