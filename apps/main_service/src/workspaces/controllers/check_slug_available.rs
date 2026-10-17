use axum::{Extension, Json, extract::State};
use error_handlers::extract::ApiQuery;
use serde::{Deserialize, Serialize};
use utoipa::ToSchema;
use uuid::Uuid;

use crate::{
    app_state::AppState,
    workspaces::{repo, utils::validate_workspace_slug},
};

#[derive(Deserialize)]
pub struct SlugAvailableQuery {
    /// The slug as typed; trimmed and lowercased before the check.
    pub s: String,
    /// The workspace whose address is being changed: its own slug and live aliases are not taken
    /// for it.
    pub workspace: Option<Uuid>,
}

#[derive(Debug, PartialEq, Eq, Serialize, ToSchema)]
#[serde(rename_all = "snake_case")]
pub enum SlugAvailability {
    /// Free to use.
    Available,
    /// Not 3–32 of `[a-z0-9-]`, or starts or ends with `-`.
    Invalid,
    /// Another workspace has it, or a live alias of another workspace's old slug.
    Taken,
    /// The address of the `workspace` asked about (now, or an alias it can take back).
    Current,
}

#[derive(Serialize, ToSchema)]
pub struct SlugAvailableResponse {
    /// Whether the slug can be set: `available` and `current`.
    available: bool,
    reason: SlugAvailability,
}

impl From<SlugAvailability> for SlugAvailableResponse {
    fn from(reason: SlugAvailability) -> Self {
        Self {
            available: matches!(
                reason,
                SlugAvailability::Available | SlugAvailability::Current
            ),
            reason,
        }
    }
}

// Checks a slug while it is typed in General or in the create dialog (debounced on the client)
#[utoipa::path(
    get,
    operation_id = "checkSlugAvailable",
    path = "/workspaces/slug-available",
    params(
        ("s" = String, Query, description = "The slug as typed"),
        ("workspace" = Option<Uuid>, Query, description = "The workspace whose address is being changed")
    ),
    responses(
        (status = 200, description = "Whether the slug can be used, and why not", body = SlugAvailableResponse),
        (status = 400, description = "Bad request"),
        (status = 401, description = "Unauthorized"),
        (status = 500, description = "Internal server error")
    ),
    tag = "Workspaces"
)]
pub async fn check_slug_available(
    State(state): State<AppState>,
    Extension(user_id): Extension<Uuid>,
    ApiQuery(params): ApiQuery<SlugAvailableQuery>,
) -> error_handlers::Result<Json<SlugAvailableResponse>> {
    let slug = params.s.trim().to_ascii_lowercase();

    if validate_workspace_slug(&slug).is_err() {
        return Ok(Json(SlugAvailability::Invalid.into()));
    }

    // Only for a member: anyone else would learn which workspace owns the slug
    if let Some(workspace_id) = params.workspace
        && repo::is_own_slug(&state.pool, user_id, workspace_id, &slug).await?
    {
        return Ok(Json(SlugAvailability::Current.into()));
    }

    let availability = if repo::is_slug_taken(&state.pool, &slug).await? {
        SlugAvailability::Taken
    } else {
        SlugAvailability::Available
    };

    Ok(Json(availability.into()))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn available_and_current_can_be_set_invalid_and_taken_cannot() {
        let can_set = |reason| SlugAvailableResponse::from(reason).available;

        assert!(can_set(SlugAvailability::Available));
        assert!(can_set(SlugAvailability::Current));
        assert!(!can_set(SlugAvailability::Invalid));
        assert!(!can_set(SlugAvailability::Taken));
    }

    #[test]
    fn the_reason_is_written_in_snake_case() {
        let body =
            serde_json::to_value(SlugAvailableResponse::from(SlugAvailability::Taken)).unwrap();

        assert_eq!(
            body,
            serde_json::json!({ "available": false, "reason": "taken" })
        );
    }
}
