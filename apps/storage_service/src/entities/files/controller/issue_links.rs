use axum::{Extension, Json, extract::State};
use error_handlers::{ApiError, extract::ApiJson};
use uuid::Uuid;

use crate::{
    entities::files::{
        links::{FileLinksRequest, FileLinksResponse, build_links, requested_ids},
        signing,
    },
    errors::FileLinksErrors,
    types::app_state::AppState,
};

/// Issues download links for many assets at once.
///
/// Public assets get a stable link, private ones a signed link that expires (see `expiresAt`).
/// Assets the caller cannot read are listed in `unavailable`, indistinguishable from assets that
/// do not exist.
#[utoipa::path(
    post,
    path = "/files/links",
    request_body = FileLinksRequest,
    responses(
        (status = 200, description = "Links for the assets the caller may read", body = FileLinksResponse),
        FileLinksErrors,
    ),
    tag = "Files",
    operation_id = "issue_file_links",
)]
pub async fn issue_links(
    State(state): State<AppState>,
    Extension(user_id): Extension<Uuid>,
    ApiJson(request): ApiJson<FileLinksRequest>,
) -> Result<Json<FileLinksResponse>, ApiError> {
    let requested = requested_ids(&request)?;
    if requested.is_empty() {
        return Ok(Json(FileLinksResponse {
            links: Vec::new(),
            unavailable: Vec::new(),
        }));
    }

    // One call for the whole batch, however many files a document embeds.
    let readable = state.main.readable_assets(Some(user_id), &requested).await?;

    build_links(&state.file_links, &requested, readable, signing::now_secs()).map(Json)
}
