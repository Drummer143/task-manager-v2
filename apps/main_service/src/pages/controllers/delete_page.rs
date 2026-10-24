use axum::{Extension, extract::State, http::StatusCode};
use chrono::Utc;
use error_handlers::{ApiError, ErrorCode, extract::ApiPath};
use sqlx::PgPool;

use crate::{
    pages::{
        controllers::PagePath,
        repo,
        service::{self, PageState},
        updates,
    },
    shared::extractors::ClientId,
    signals::Signals,
    workspaces::middleware::WorkspaceContext,
};

/// Moves the page, with every page under it, to the trash (pages spec §7): `restore` brings them
/// back for 30 days. Deleting a page in the trash changes nothing.
#[utoipa::path(
    delete,
    path = "/workspaces/{workspace_id}/pages/{page_id}",
    operation_id = "deletePage",
    params(
        ("workspace_id" = Uuid, Path, description = "Target workspace id"),
        ("page_id" = Uuid, Path, description = "Target page id")
    ),
    responses(
        (status = 204, description = "In the trash, now or before"),
        (status = 401, description = "Unauthorized"),
        (status = 404, description = "Page not found"),
        (status = 500, description = "Internal server error")
    ),
    tag = "Pages"
)]
pub async fn delete_page(
    State(pool): State<PgPool>,
    State(signals): State<Signals>,
    ClientId(origin): ClientId,
    Extension(workspace_ctx): Extension<WorkspaceContext>,
    ApiPath(path): ApiPath<PagePath>,
) -> error_handlers::Result<StatusCode> {
    service::ensure_access(&workspace_ctx)?;

    let workspace_id = workspace_ctx.workspace.id;
    let user_id = workspace_ctx.member.user_id;

    let mut tx = pool.begin().await?;
    let current = repo::lock(&mut *tx, workspace_id, path.page_id)
        .await?
        .ok_or_else(|| ApiError::new(ErrorCode::NotFound))?;

    // In the trash already: the same request again
    if current.deleted_at.is_some() {
        return Ok(StatusCode::NO_CONTENT);
    }

    let at = Utc::now();
    repo::trash_descendants(&mut *tx, current.id, at, user_id).await?;
    let next = PageState {
        deleted_at: Some(at),
        deleted_root: Some(current.id),
        ..PageState::from(&current)
    };
    service::update_page(&mut tx, &current, next, user_id).await?;

    tx.commit().await?;

    updates::publish_tree_changed(
        &signals,
        workspace_id,
        current.id,
        updates::PAGE_DELETED,
        origin,
    )
    .await;

    Ok(StatusCode::NO_CONTENT)
}
