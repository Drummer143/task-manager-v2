use axum::{Extension, Json, extract::State};
use error_handlers::{
    ApiError, ErrorCode,
    extract::{ApiJson, ApiPath},
};
use sql_models::workspace::model::Capability;
use sqlx::PgPool;

use crate::{
    pages::{
        controllers::PagePath,
        dto::{MovePageRequest, PageResponse},
        repo,
        service::{self, PageState},
        updates,
    },
    shared::extractors::ClientId,
    signals::Signals,
    workspaces::middleware::WorkspaceContext,
};

/// Puts the page, with everything under it, at `index` among the children of `parentId`. Never
/// under itself, never deeper than 12 levels for any page of its subtree.
#[utoipa::path(
    post,
    path = "/workspaces/{workspace_id}/pages/{page_id}/move",
    operation_id = "movePage",
    params(
        ("workspace_id" = Uuid, Path, description = "Target workspace id"),
        ("page_id" = Uuid, Path, description = "Target page id")
    ),
    request_body = MovePageRequest,
    responses(
        (status = 200, description = "The page at its new place", body = PageResponse),
        (status = 401, description = "Unauthorized"),
        (status = 403, description = "To the root without `pages.create_root`"),
        (status = 404, description = "Page not found, or in the trash"),
        (status = 422, description = "The parent is not here, `PAGE_CYCLE` or `PAGE_TOO_DEEP`"),
        (status = 500, description = "Internal server error")
    ),
    tag = "Pages"
)]
pub async fn move_page(
    State(pool): State<PgPool>,
    State(signals): State<Signals>,
    ClientId(origin): ClientId,
    Extension(workspace_ctx): Extension<WorkspaceContext>,
    ApiPath(path): ApiPath<PagePath>,
    ApiJson(body): ApiJson<MovePageRequest>,
) -> error_handlers::Result<Json<PageResponse>> {
    let access = service::ensure_access(&workspace_ctx)?;

    let workspace_id = workspace_ctx.workspace.id;
    let user_id = workspace_ctx.member.user_id;

    let mut tx = pool.begin().await?;
    let current = repo::lock(&mut *tx, workspace_id, path.page_id)
        .await?
        .filter(|page| page.deleted_at.is_none())
        .ok_or_else(|| ApiError::new(ErrorCode::NotFound))?;

    let parent_depth = match body.parent_id {
        Some(parent_id) => {
            service::check_parent(&mut tx, workspace_id, parent_id, Some(current.id)).await?
        }
        None => {
            if current.parent_id.is_some() {
                workspace_ctx.authorize(Capability::PagesCreateRoot)?;
            }
            0
        }
    };
    if parent_depth + repo::subtree_height(&mut *tx, current.id).await? > service::MAX_DEPTH {
        return Err(service::too_deep());
    }

    // Where it already is: a key that only differs would change nothing anyone sees
    let index = body.index as usize;
    if body.parent_id == current.parent_id {
        let siblings =
            repo::children(&mut *tx, workspace_id, current.parent_id, Some(current.id)).await?;
        let now = siblings
            .iter()
            .take_while(|(id, key)| (key.as_str(), *id) < (current.position.as_str(), current.id))
            .count();
        if index.min(siblings.len()) == now {
            return Ok(Json(PageResponse::new(current, access)));
        }
    }

    let position = service::place(
        &mut tx,
        workspace_id,
        body.parent_id,
        Some(index),
        Some(current.id),
    )
    .await?;
    let next = PageState {
        parent_id: body.parent_id,
        position,
        ..PageState::from(&current)
    };
    let Some(moved) = service::update_page(&mut tx, &current, next, user_id).await? else {
        return Ok(Json(PageResponse::new(current, access)));
    };

    tx.commit().await?;

    updates::publish_tree_changed(
        &signals,
        workspace_id,
        moved.id,
        updates::PAGE_MOVED,
        origin,
    )
    .await;

    Ok(Json(PageResponse::new(moved, access)))
}
