use axum::{Extension, Json, extract::State};
use error_handlers::ApiError;
use serde::Serialize;
use utoipa::ToSchema;
use uuid::Uuid;

#[derive(Debug, serde::Serialize, ToSchema)]
pub struct WorkspaceSummary {
    id: Uuid,
    unread: i64,
}

#[derive(Debug, Serialize, ToSchema)]
pub struct SummaryResponse {
    workspaces: Vec<WorkspaceSummary>,
}

#[utoipa::path(
    get,
    path = "/notifications/summary",
    operation_id = "getNotificationSummary",
    responses(
        (status = 200, description = "Notification summary", body = SummaryResponse),
        (status = 401, description = "Unauthorized"),
        (status = 500, description = "Internal server error")
    )
)]
pub async fn get_summary(
    State(pool): State<sqlx::PgPool>,
    Extension(user_id): Extension<Uuid>,
) -> Result<Json<SummaryResponse>, ApiError> {
    let unread =
        crate::notifications::repo::NotificationsRepository::count_unread(&pool, user_id).await?;

    Ok(Json(SummaryResponse {
        workspaces: vec![WorkspaceSummary {
            id: Uuid::nil(),
            unread,
        }],
    }))
}
