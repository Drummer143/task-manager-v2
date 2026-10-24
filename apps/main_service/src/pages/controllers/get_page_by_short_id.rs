use axum::{Extension, Json, extract::State};
use error_handlers::{ApiError, ErrorCode, extract::ApiPath};
use serde::Deserialize;
use sqlx::PgPool;

use crate::{
    pages::{dto::PageResponse, repo, service},
    workspaces::middleware::WorkspaceContext,
};

#[derive(Deserialize)]
pub struct ShortIdPath {
    pub short_id: String,
}

/// Opens a page by its address, `/{ws}/p/{shortId}`. A page in the trash is answered too, with
/// `deletedAt`: the address is right, the page shows "This page is in Trash" (pages spec §2).
#[utoipa::path(
    get,
    path = "/workspaces/{workspace_id}/pages/by-short/{short_id}",
    operation_id = "getPageByShortId",
    params(
        ("workspace_id" = Uuid, Path, description = "Target workspace id"),
        ("short_id" = String, Path, description = "The page's short id")
    ),
    responses(
        (status = 200, description = "The page, live or in the trash", body = PageResponse),
        (status = 401, description = "Unauthorized"),
        (status = 404, description = "No such page in this workspace"),
        (status = 500, description = "Internal server error")
    ),
    tag = "Pages"
)]
pub async fn get_page_by_short_id(
    State(pool): State<PgPool>,
    Extension(workspace_ctx): Extension<WorkspaceContext>,
    ApiPath(path): ApiPath<ShortIdPath>,
) -> error_handlers::Result<Json<PageResponse>> {
    let access = service::ensure_access(&workspace_ctx)?;

    let page = repo::get_by_short_id(&pool, workspace_ctx.workspace.id, &path.short_id)
        .await?
        .ok_or_else(|| ApiError::new(ErrorCode::NotFound))?;

    Ok(Json(PageResponse::new(page, access)))
}
