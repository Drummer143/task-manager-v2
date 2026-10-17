use axum::{Extension, Json};
use error_handlers::ApiError;

use crate::workspaces::{dto::WorkspaceResponse, middleware::WorkspaceContext};

#[utoipa::path(
    get,
    path = "/workspaces/{workspace_id}",
    operation_id = "getWorkspaceById",
    params(
        ("workspace_id" = Uuid, Path, description = "Target workspace id")
    ),
    responses(
        (status = 200, description = "The workspace", body = WorkspaceResponse),
        (status = 401, description = "Unauthorized"),
        (status = 404, description = "Workspace not found"),
        (status = 500, description = "Internal server error")
    ),
    tag = "Workspaces"
)]
pub async fn get_workspace_by_id(
    Extension(workspace_context): Extension<WorkspaceContext>,
) -> Result<Json<WorkspaceResponse>, ApiError> {
    // Membership and deletion are checked by `load_workspace_context_with_deleted`: only the
    // owner gets here with a deleted workspace, and sees when it was deleted
    let deleted_at = workspace_context.workspace.deleted_at;
    let mut workspace_response = WorkspaceResponse::from(workspace_context.workspace);
    workspace_response.deleted_at = deleted_at;

    Ok(Json(workspace_response))
}
