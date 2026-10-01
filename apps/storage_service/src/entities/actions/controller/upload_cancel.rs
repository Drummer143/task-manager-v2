use crate::{
    entities::actions::service::ActionsService, errors::UploadTransactionErrors,
    types::app_state::AppState,
};
use axum::{Extension, extract::State};
use error_handlers::{ApiError, extract::ApiPath};
use uuid::Uuid;

#[utoipa::path(
    delete,
    path = "/actions/upload/{transaction_id}/cancel",
    params(
        ("transaction_id" = Uuid, Path, description = "Transaction ID"),
    ),
    responses(
        (status = 200, description = "Upload cancelled"),
        UploadTransactionErrors,
    ),
    tags = ["Upload file"],
)]
pub async fn upload_cancel(
    State(state): State<AppState>,
    Extension(user_id): Extension<Uuid>,
    ApiPath(transaction_id): ApiPath<Uuid>,
) -> Result<(), ApiError> {
    ActionsService::upload_cancel(&state, user_id, transaction_id).await
}
