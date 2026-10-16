use axum::{Extension, Json, extract::State, http::StatusCode};
use error_handlers::{ApiError, ErrorCode, FieldError, extract::ApiJson};
use uuid::Uuid;

use crate::{
    app_state::AppState,
    workspaces::{
        dto::WorkspaceResponse,
        repo::{self, InitWorkspaceResponse},
        service::{self, CreateWorkspaceRequest},
        utils,
    },
};

/// The `UNIQUE` of `workspaces.slug`: someone took the slug between the check and the insert.
const SLUG_CONSTRAINT: &str = "workspaces_slug_key";

/// Creates a workspace with its built-in roles; the creator becomes its owner with Admin.
/// Sending the same request again (same `id`, same creator) returns the workspace with `200`.
#[utoipa::path(
    post,
    path = "/workspaces",
    operation_id = "createWorkspace",
    request_body = CreateWorkspaceRequest,
    responses(
        (status = 200, description = "Workspace already exists", body = WorkspaceResponse),
        (status = 201, description = "Workspace created", body = WorkspaceResponse),
        (status = 400, description = "Bad request"),
        (status = 401, description = "Unauthorized"),
        (status = 409, description = "The slug is taken, or the id belongs to another workspace"),
        (status = 422, description = "Invalid name, slug or task prefix"),
        (status = 500, description = "Internal server error")
    ),
    tag = "Workspaces"
)]
pub async fn create_workspace(
    State(state): State<AppState>,
    Extension(user_id): Extension<Uuid>,
    ApiJson(body): ApiJson<CreateWorkspaceRequest>,
) -> error_handlers::Result<(StatusCode, Json<WorkspaceResponse>)> {
    // TODO: add check if user can create workspace - canCreateWorkspace

    let name = body.name.trim();
    let slug = body.slug.as_deref().map(str::trim);
    let task_prefix = body.task_prefix.as_deref().map(str::trim);

    service::validate_create_workspace_request(&state.pool, name, slug, task_prefix).await?;

    let slug = match slug {
        Some(slug) => slug.to_owned(),
        None => {
            let base = utils::name_to_slug(name);
            let similar = repo::find_similar_slugs(&state.pool, &base).await?;
            utils::find_available_slug(&base, &similar)
        }
    };

    let task_prefix = match task_prefix {
        Some(task_prefix) => task_prefix.to_owned(),
        None => utils::name_to_task_prefix(name),
    };

    let created = repo::init_workspace(
        &state.pool,
        repo::CreateWorkspaceRequest {
            id: body.id,
            name: name.to_owned(),
            slug,
            task_prefix,
        },
        &user_id,
    )
    .await
    .map_err(|error| match error {
        sqlx::Error::Database(db) if db.constraint() == Some(SLUG_CONSTRAINT) => {
            service::slug_taken()
        }
        other => ApiError::from(other),
    })?;

    match created {
        InitWorkspaceResponse::Created(workspace) => Ok((
            StatusCode::CREATED,
            Json(WorkspaceResponse::from(workspace)),
        )),
        InitWorkspaceResponse::Existed(workspace) => {
            let is_owner = repo::get_member_in_workspace(&state.pool, user_id, workspace.id)
                .await
                .is_ok_and(|member| member.is_owner);

            // The same request again: only its creator, while the workspace is not deleted
            if is_owner && workspace.deleted_at.is_none() {
                return Ok((StatusCode::OK, Json(WorkspaceResponse::from(workspace))));
            }

            Err(ApiError::new(ErrorCode::Conflict)
                .with_field_errors(vec![FieldError::new("id", ErrorCode::Conflict)]))
        }
    }
}
