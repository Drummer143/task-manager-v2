use std::collections::HashMap;

use axum::{Extension, Json, extract::State};
use error_handlers::ApiError;
use serde::Serialize;
use utoipa::ToSchema;
use uuid::Uuid;

use crate::{
    app_state::AppState,
    workspaces::dto::{RoleShortResponse, WorkspaceResponse},
};

#[derive(Serialize, ToSchema)]
#[serde(rename_all = "camelCase")]
pub struct WorkspaceWithRoles {
    #[serde(flatten)]
    workspace: WorkspaceResponse,
    is_owner: bool,
    roles: Vec<RoleShortResponse>,
}

#[utoipa::path(
    get,
    path = "/workspaces",
    operation_id = "getUserWorkspaces",
    responses(
        (status = 200, description = "The user's workspaces, by name", body = [WorkspaceWithRoles]),
        (status = 401, description = "Unauthorized"),
        (status = 500, description = "Internal server error")
    ),
    tag = "Workspaces"
)]
pub async fn get_user_workspaces(
    State(state): State<AppState>,
    Extension(user_id): Extension<Uuid>,
) -> Result<Json<Vec<WorkspaceWithRoles>>, ApiError> {
    let workspaces = crate::workspaces::repo::get_user_workspaces(&state.pool, user_id).await?;

    let roles = crate::workspaces::repo::get_roles_by_workspace_ids(
        &state.pool,
        user_id,
        workspaces.iter().map(|w| w.workspace.id).collect(),
    )
    .await?;

    let mut roles_by_workspace: HashMap<Uuid, Vec<RoleShortResponse>> = HashMap::new();

    for role in roles {
        roles_by_workspace
            .entry(role.workspace_id)
            .or_default()
            .push(RoleShortResponse::from(role));
    }

    let response: Vec<WorkspaceWithRoles> = workspaces
        .into_iter()
        .map(|user_workspace| {
            let uuid = user_workspace.workspace.id;
            let deleted_at = user_workspace.workspace.deleted_at;
            let mut workspace = WorkspaceResponse::from(user_workspace.workspace);

            if user_workspace.is_owner {
                workspace.deleted_at = deleted_at;
            }

            WorkspaceWithRoles {
                roles: roles_by_workspace.get(&uuid).cloned().unwrap_or_default(),
                is_owner: user_workspace.is_owner,
                workspace,
            }
        })
        .collect();

    Ok(Json(response))
}
