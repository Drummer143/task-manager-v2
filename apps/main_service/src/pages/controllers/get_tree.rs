use axum::{Extension, Json, extract::State};
use sqlx::PgPool;

use crate::{
    pages::{dto::PageNodeResponse, repo, service},
    workspaces::middleware::WorkspaceContext,
};

/// Every page of the workspace the user sees, flat: the client builds the tree from `parentId`,
/// each parent's children ordered by `position`, then `id`.
#[utoipa::path(
    get,
    path = "/workspaces/{workspace_id}/pages",
    operation_id = "getPageTree",
    params(
        ("workspace_id" = Uuid, Path, description = "Target workspace id")
    ),
    responses(
        (status = 200, description = "The pages, each parent's children in their order", body = Vec<PageNodeResponse>),
        (status = 401, description = "Unauthorized"),
        (status = 404, description = "Workspace not found"),
        (status = 500, description = "Internal server error")
    ),
    tag = "Pages"
)]
pub async fn get_tree(
    State(pool): State<PgPool>,
    Extension(workspace_ctx): Extension<WorkspaceContext>,
) -> error_handlers::Result<Json<Vec<PageNodeResponse>>> {
    let Some(access) = service::access(&workspace_ctx) else {
        return Ok(Json(Vec::new()));
    };

    let pages = repo::tree(&pool, workspace_ctx.workspace.id).await?;

    Ok(Json(
        pages
            .into_iter()
            .map(|page| PageNodeResponse::new(page, access))
            .collect(),
    ))
}
