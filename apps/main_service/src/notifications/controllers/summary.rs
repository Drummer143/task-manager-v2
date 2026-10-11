use axum::{Extension, Json, extract::State};
use error_handlers::ApiError;
use uuid::Uuid;

use crate::notifications::summary::{SummaryResponse, load_summary};

#[utoipa::path(
    get,
    path = "/notifications/summary",
    operation_id = "getNotificationSummary",
    responses(
        (status = 200, description = "Notification summary", body = SummaryResponse),
        (status = 401, description = "Unauthorized"),
        (status = 500, description = "Internal server error")
    ),
    tag = "Notifications"
)]
pub async fn get_summary(
    State(pool): State<sqlx::PgPool>,
    Extension(user_id): Extension<Uuid>,
) -> Result<Json<SummaryResponse>, ApiError> {
    Ok(Json(load_summary(&pool, user_id).await?))
}
