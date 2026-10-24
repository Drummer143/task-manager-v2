use axum::{Extension, Json, extract::State, http::StatusCode};
use error_handlers::{ApiError, ErrorCode, FieldError, extract::ApiJson};
use sql_models::{page::model::Page, workspace::model::Capability};
use sqlx::PgPool;
use uuid::Uuid;

use crate::{
    pages::{
        dto::{CreatePageRequest, PageAccess, PageResponse, fields},
        repo::{self, NewPage},
        service, short_id, updates,
    },
    shared::extractors::ClientId,
    signals::Signals,
    workspaces::middleware::WorkspaceContext,
};

/// How many server-made short ids to try before giving up: a collision is a 1 in 10¹⁷ event.
const SHORT_ID_ATTEMPTS: usize = 3;

/// Creates a page, last among its siblings, with its (empty) body. The client may make the id and
/// the short id itself, to open the page before the answer (pages spec, creation §02); sending
/// the same request again (same `id`, same creator) answers with the page, `200`.
#[utoipa::path(
    post,
    path = "/workspaces/{workspace_id}/pages",
    operation_id = "createPage",
    params(
        ("workspace_id" = Uuid, Path, description = "Target workspace id")
    ),
    request_body = CreatePageRequest,
    responses(
        (status = 200, description = "Created before by the same request", body = PageResponse),
        (status = 201, description = "Page created", body = PageResponse),
        (status = 401, description = "Unauthorized"),
        (status = 403, description = "At the root without `pages.create_root`"),
        (status = 404, description = "Workspace not found"),
        (status = 409, description = "The short id is taken, or the id is another page's"),
        (status = 422, description = "Invalid fields, the parent is not here, or too deep"),
        (status = 500, description = "Internal server error")
    ),
    tag = "Pages"
)]
pub async fn create_page(
    State(pool): State<PgPool>,
    State(signals): State<Signals>,
    ClientId(origin): ClientId,
    Extension(workspace_ctx): Extension<WorkspaceContext>,
    ApiJson(body): ApiJson<CreatePageRequest>,
) -> error_handlers::Result<(StatusCode, Json<PageResponse>)> {
    let access = service::ensure_access(&workspace_ctx)?;
    if body.parent_id.is_none() {
        workspace_ctx.authorize(Capability::PagesCreateRoot)?;
    }

    let title = body.title.as_deref().unwrap_or_default().trim().to_owned();
    validate(&body, &title)?;

    let workspace_id = workspace_ctx.workspace.id;
    let user_id = workspace_ctx.member.user_id;

    let mut tx = pool.begin().await?;

    if let Some(id) = body.id
        && let Some(existing) = repo::get(&mut *tx, id).await?
    {
        return same_request(existing, workspace_id, user_id, access);
    }

    if let Some(parent_id) = body.parent_id {
        let depth = service::check_parent(&mut tx, workspace_id, parent_id, None).await?;
        if depth + 1 > service::MAX_DEPTH {
            return Err(service::too_deep());
        }
    }

    let position = service::place(&mut tx, workspace_id, body.parent_id, None, None).await?;
    let id = body.id.unwrap_or_else(Uuid::now_v7);

    let mut attempts = 0;
    let page = loop {
        attempts += 1;
        let short_id = body.short_id.clone().unwrap_or_else(short_id::generate);

        // A savepoint: a collision must not abort the transaction
        let mut attempt = sqlx::Acquire::begin(&mut *tx).await?;
        let inserted = repo::insert(
            &mut attempt,
            NewPage {
                id,
                workspace_id,
                parent_id: body.parent_id,
                position: position.clone(),
                r#type: body.r#type,
                title: title.clone(),
                icon: body.icon.clone(),
                short_id,
                created_by: user_id,
            },
        )
        .await;

        let error = match inserted {
            Ok(page) => {
                attempt.commit().await?;
                break page;
            }
            Err(error) => error,
        };
        attempt.rollback().await?;

        match unique_constraint(&error).as_deref() {
            // The same request, sent twice at once: the other one made it
            Some(repo::ID_CONSTRAINT) => {
                drop(tx);
                let existing = repo::get(&pool, id)
                    .await?
                    .ok_or_else(|| ApiError::internal(error))?;
                return same_request(existing, workspace_id, user_id, access);
            }
            Some(repo::SHORT_ID_CONSTRAINT) if body.short_id.is_some() => {
                return Err(ApiError::new(ErrorCode::Conflict)
                    .with_field_errors(vec![FieldError::new(fields::SHORT_ID, ErrorCode::Taken)]));
            }
            Some(repo::SHORT_ID_CONSTRAINT) if attempts < SHORT_ID_ATTEMPTS => {}
            _ => return Err(error.into()),
        }
    };

    tx.commit().await?;

    updates::publish_tree_changed(
        &signals,
        workspace_id,
        page.id,
        updates::PAGE_CREATED,
        origin,
    )
    .await;

    Ok((StatusCode::CREATED, Json(PageResponse::new(page, access))))
}

/// The constraint a unique violation hit, if that is what `error` is.
fn unique_constraint(error: &sqlx::Error) -> Option<String> {
    match error {
        sqlx::Error::Database(db) if db.is_unique_violation() => db.constraint().map(str::to_owned),
        _ => None,
    }
}

/// The page with this id exists: made by this request before (`200`), or the id is someone
/// else's (`409`).
fn same_request(
    existing: Page,
    workspace_id: Uuid,
    user_id: Uuid,
    access: PageAccess,
) -> error_handlers::Result<(StatusCode, Json<PageResponse>)> {
    if existing.workspace_id == workspace_id && existing.created_by == Some(user_id) {
        Ok((StatusCode::OK, Json(PageResponse::new(existing, access))))
    } else {
        Err(ApiError::new(ErrorCode::Conflict)
            .with_field_errors(vec![FieldError::new(fields::ID, ErrorCode::Taken)]))
    }
}

/// Every bad field at once.
fn validate(body: &CreatePageRequest, title: &str) -> error_handlers::Result<()> {
    let errors: Vec<FieldError> = [
        service::validate_title(title)
            .err()
            .map(|code| FieldError::new(fields::TITLE, code)),
        body.icon
            .as_ref()
            .and_then(|icon| service::validate_icon(icon).err())
            .map(|code| FieldError::new(fields::ICON, code)),
        body.short_id
            .as_deref()
            .filter(|short| !short_id::is_valid(short))
            .map(|_| FieldError::new(fields::SHORT_ID, ErrorCode::InvalidFormat)),
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
