use axum::{Extension, Json, extract::State};
use error_handlers::{ApiError, ErrorCode, extract::ApiPath};
use sqlx::PgPool;

use crate::{
    pages::{
        controllers::PagePath,
        dto::{PageResponse, RestorePageResponse},
        repo,
        service::{self, PageState},
        updates,
    },
    shared::extractors::ClientId,
    signals::Signals,
    workspaces::middleware::WorkspaceContext,
};

/// Brings back a page from the trash with the pages trashed with it, at its old place. When its
/// parent is gone or in the trash, at the end of the root instead. A page trashed with its
/// parent is restored by restoring that parent (`deletedRoot`); restoring a live page changes
/// nothing.
#[utoipa::path(
    post,
    path = "/workspaces/{workspace_id}/pages/{page_id}/restore",
    operation_id = "restorePage",
    params(
        ("workspace_id" = Uuid, Path, description = "Target workspace id"),
        ("page_id" = Uuid, Path, description = "Target page id")
    ),
    responses(
        (status = 200, description = "The page, back", body = RestorePageResponse),
        (status = 401, description = "Unauthorized"),
        (status = 404, description = "Page not found, or erased from the trash"),
        (status = 409, description = "Trashed with its parent: restore `deletedRoot`"),
        (status = 500, description = "Internal server error")
    ),
    tag = "Pages"
)]
pub async fn restore_page(
    State(pool): State<PgPool>,
    State(signals): State<Signals>,
    ClientId(origin): ClientId,
    Extension(workspace_ctx): Extension<WorkspaceContext>,
    ApiPath(path): ApiPath<PagePath>,
) -> error_handlers::Result<Json<RestorePageResponse>> {
    let access = service::ensure_access(&workspace_ctx)?;

    let workspace_id = workspace_ctx.workspace.id;
    let user_id = workspace_ctx.member.user_id;

    let mut tx = pool.begin().await?;
    let current = repo::lock(&mut *tx, workspace_id, path.page_id)
        .await?
        .ok_or_else(|| ApiError::new(ErrorCode::NotFound))?;

    // Live: restored already, the same request again
    if current.deleted_at.is_none() {
        return Ok(Json(RestorePageResponse {
            page: PageResponse::new(current, access),
            restored_to_root: false,
        }));
    }
    if current.deleted_root != Some(current.id) {
        return Err(ApiError::new(ErrorCode::Conflict));
    }

    let parent_alive = match current.parent_id {
        Some(parent_id) => repo::get(&mut *tx, parent_id)
            .await?
            .is_some_and(|parent| parent.deleted_at.is_none()),
        None => true,
    };
    let (parent_id, position) = if parent_alive {
        (current.parent_id, current.position.clone())
    } else {
        let position = service::place(&mut tx, workspace_id, None, None, None).await?;
        (None, position)
    };

    repo::restore_descendants(&mut *tx, current.id, user_id).await?;
    let next = PageState {
        parent_id,
        position,
        deleted_at: None,
        deleted_root: None,
        ..PageState::from(&current)
    };
    let restored = service::update_page(&mut tx, &current, next, user_id)
        .await?
        .ok_or_else(|| ApiError::new(ErrorCode::Internal))?;

    tx.commit().await?;

    updates::publish_tree_changed(
        &signals,
        workspace_id,
        restored.id,
        updates::PAGE_RESTORED,
        origin,
    )
    .await;

    Ok(Json(RestorePageResponse {
        page: PageResponse::new(restored, access),
        restored_to_root: !parent_alive,
    }))
}
