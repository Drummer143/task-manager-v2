use axum::{Extension, Json, extract::State};
use error_handlers::extract::ApiQuery;
use serde::{Deserialize, Serialize};
use utoipa::ToSchema;
use uuid::Uuid;

use crate::{app_state::AppState, workspaces::repo};

#[derive(Deserialize)]
pub struct ResolveSlugQuery {
    pub slug: String,
}

#[derive(Serialize, ToSchema)]
pub struct SlugResponse {
    id: Uuid,
    /// The current slug: when it differs from the asked one, the frontend replaces the address.
    slug: String,
}

// Resolves slug alias to current workspace's slug
#[utoipa::path(
    get,
    operation_id = "resolveSlug",
    path = "/workspaces/resolve",
    params(
        ("slug" = String, Query, description = "Target slug")
    ),
    responses(
        (status = 200, description = "Slug found", body = SlugResponse),
        (status = 401, description = "Unauthorized"),
        (status = 404, description = "Slug not found"),
        (status = 500, description = "Internal server error")
    ),
    tag = "Workspaces"
)]
pub async fn resolve_slug(
    State(state): State<AppState>,
    Extension(user_id): Extension<Uuid>,
    ApiQuery(params): ApiQuery<ResolveSlugQuery>,
) -> error_handlers::Result<Json<SlugResponse>> {
    let workspace = repo::get_workspace_by_slug(&state.pool, user_id, &params.slug).await?;

    Ok(Json(SlugResponse {
        id: workspace.id,
        slug: workspace.slug,
    }))
}
