use axum::{Extension, Json, extract::State};
use error_handlers::{
    ApiError, ErrorCode, FieldError,
    extract::{ApiJson, ApiPath},
};
use sqlx::PgPool;

use crate::{
    pages::{
        controllers::PagePath,
        dto::{PageChangeSet, PageResponse, PatchPageRequest, fields},
        repo,
        service::{self, PageState},
        updates,
    },
    shared::extractors::ClientId,
    signals::Signals,
    workspaces::middleware::WorkspaceContext,
};

/// Edits the title, the icon, the type — only the fields sent, each checked for a conflict on its
/// own (backend spec §5.3). The type changes only while the page is empty.
#[utoipa::path(
    patch,
    path = "/workspaces/{workspace_id}/pages/{page_id}",
    operation_id = "patchPage",
    params(
        ("workspace_id" = Uuid, Path, description = "Target workspace id"),
        ("page_id" = Uuid, Path, description = "Target page id")
    ),
    request_body = PatchPageRequest,
    responses(
        (status = 200, description = "The page as it is now", body = PageResponse),
        (status = 401, description = "Unauthorized"),
        (status = 404, description = "Page not found, or in the trash"),
        (status = 409, description = "`EDIT_CONFLICT`: someone changed these fields since; `PAGE_NOT_EMPTY`: the type can no longer change"),
        (status = 422, description = "Invalid fields, nothing to set, or a version from the future"),
        (status = 500, description = "Internal server error")
    ),
    tag = "Pages"
)]
pub async fn patch_page(
    State(pool): State<PgPool>,
    State(signals): State<Signals>,
    ClientId(origin): ClientId,
    Extension(workspace_ctx): Extension<WorkspaceContext>,
    ApiPath(path): ApiPath<PagePath>,
    ApiJson(body): ApiJson<PatchPageRequest>,
) -> error_handlers::Result<Json<PageResponse>> {
    let access = service::ensure_access(&workspace_ctx)?;

    let set = PageChangeSet {
        title: body.set.title.map(|title| title.trim().to_owned()),
        ..body.set
    };
    if set.is_empty() {
        return Err(ApiError::new(ErrorCode::EmptyRequestBody));
    }
    validate(&set)?;

    let workspace_id = workspace_ctx.workspace.id;
    let user_id = workspace_ctx.member.user_id;

    let mut tx = pool.begin().await?;
    let current = repo::lock(&mut *tx, workspace_id, path.page_id)
        .await?
        .filter(|page| page.deleted_at.is_none())
        .ok_or_else(|| ApiError::new(ErrorCode::NotFound))?;

    service::check_conflicts(&mut tx, &current, body.base_version, &sent_fields(&set)).await?;

    if let Some(r#type) = set.r#type
        && r#type != current.r#type
    {
        // Held until the commit: nothing is written to the body while its emptiness is checked
        repo::lock_body(&mut *tx, current.id).await?;
        if repo::has_content(&mut *tx, current.id).await? {
            return Err(ApiError::new(ErrorCode::PageNotEmpty));
        }
    }

    let next = PageState {
        title: set.title.unwrap_or_else(|| current.title.clone()),
        icon: set
            .icon
            .unwrap_or_else(|| current.icon.as_ref().map(|icon| icon.0.clone())),
        r#type: set.r#type.unwrap_or(current.r#type),
        ..PageState::from(&current)
    };
    let tree_changed = next.title != current.title
        || next.r#type != current.r#type
        || next.icon != current.icon.as_ref().map(|icon| icon.0.clone());

    // Everything sent is as it already is: no new version, nothing to signal
    let Some(updated) = service::update_page(&mut tx, &current, next, user_id).await? else {
        return Ok(Json(PageResponse::new(current, access)));
    };

    tx.commit().await?;

    updates::publish_updated(&signals, workspace_id, updated.id, tree_changed, origin).await;

    Ok(Json(PageResponse::new(updated, access)))
}

/// The API's names of the fields the edit sets.
fn sent_fields(set: &PageChangeSet) -> Vec<&'static str> {
    [
        (set.title.is_some(), fields::TITLE),
        (set.icon.is_some(), fields::ICON),
        (set.r#type.is_some(), fields::TYPE),
    ]
    .into_iter()
    .filter_map(|(sent, field)| sent.then_some(field))
    .collect()
}

/// Every bad field at once.
fn validate(set: &PageChangeSet) -> error_handlers::Result<()> {
    let errors: Vec<FieldError> = [
        set.title
            .as_deref()
            .and_then(|title| service::validate_title(title).err())
            .map(|code| FieldError::new(fields::TITLE, code)),
        set.icon
            .as_ref()
            .and_then(|icon| icon.as_ref())
            .and_then(|icon| service::validate_icon(icon).err())
            .map(|code| FieldError::new(fields::ICON, code)),
    ]
    .into_iter()
    .flatten()
    .collect();

    if errors.is_empty() {
        Ok(())
    } else {
        Err(ApiError::validation(errors))
    }
}
