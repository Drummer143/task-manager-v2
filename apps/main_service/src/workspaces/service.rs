use error_handlers::{ApiError, ErrorCode, FieldError};
use serde::Deserialize;
use sqlx::Postgres;
use utoipa::ToSchema;
use uuid::Uuid;

use crate::workspaces::{
    repo,
    utils::{validate_task_prefix, validate_workspace_name, validate_workspace_slug},
};

#[derive(Deserialize, ToSchema)]
#[serde(rename_all = "camelCase")]
pub struct CreateWorkspaceRequest {
    pub id: Uuid,
    pub name: String,
    pub slug: Option<String>,
    pub task_prefix: Option<String>,
}

// WORKSPACE

pub async fn validate_create_workspace_request(
    executor: impl sqlx::Executor<'_, Database = Postgres>,
    id: Option<&Uuid>,
    name: &str,
    slug: Option<&str>,
    task_prefix: Option<&str>,
) -> error_handlers::Result<()> {
    let mut errors: Vec<FieldError> = Vec::new();

    if let Some(id) = id && id.get_version_num() != 7 {
        errors.push(FieldError::new("id", ErrorCode::InvalidFormat));
    }

    if let Err(code) = validate_workspace_name(name) {
        errors.push(FieldError::new("name", code));
    }

    if let Some(slug) = slug
        && let Err(code) = validate_workspace_slug(slug)
    {
        errors.push(FieldError::new("slug", code));
    }

    if let Some(task_prefix) = task_prefix
        && let Err(code) = validate_task_prefix(task_prefix)
    {
        errors.push(FieldError::new("taskPrefix", code));
    }

    if !errors.is_empty() {
        return Err(ApiError::validation(errors));
    }

    if let Some(slug) = slug
        && repo::is_slug_taken(executor, slug).await?
    {
        return Err(slug_taken());
    }

    Ok(())
}

/// `409` with `slug: TAKEN`: another workspace has it, or a live alias does.
pub fn slug_taken() -> ApiError {
    ApiError::new(ErrorCode::Conflict)
        .with_field_errors(vec![FieldError::new("slug", ErrorCode::Taken)])
}
