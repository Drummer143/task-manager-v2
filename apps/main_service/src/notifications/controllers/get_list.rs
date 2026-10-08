use axum::{Extension, Json, extract::State};
use error_handlers::{ApiError, extract::ApiQuery};
use serde::{Deserialize, Serialize};
use sql_models::notification::model::Notification;
use utoipa::{IntoParams, ToSchema};
use uuid::Uuid;

use crate::notifications::{
    cursor::Cursor,
    repo::{InboxView, NotificationsRepository},
};

const DEFAULT_LIMIT: i64 = 50;
const MAX_LIMIT: i64 = 100;

#[derive(Debug, Default, Deserialize, IntoParams)]
#[into_params(parameter_in = Query)]
pub struct GetListQuery {
    /// Inbox tab; `unread` by default.
    #[serde(default)]
    #[param(inline)]
    pub view: InboxView,
    /// Page size, 1 to 100; 50 by default.
    pub limit: Option<i64>,
    /// `nextCursor` of the previous page; none for the first page.
    #[param(value_type = Option<String>)]
    pub cursor: Option<Cursor>,
}

impl GetListQuery {
    /// Kept in range: a huge limit would read the whole table, a negative one is a database
    /// error.
    fn limit(&self) -> i64 {
        self.limit.unwrap_or(DEFAULT_LIMIT).clamp(1, MAX_LIMIT)
    }
}

/// One page of a tab.
#[derive(Debug, Serialize, ToSchema)]
#[serde(rename_all = "camelCase")]
pub struct NotificationPage {
    pub data: Vec<Notification>,
    /// Pass it as `cursor` to get the next page; `null` on the last page.
    pub next_cursor: Option<String>,
}

#[axum::debug_handler]
#[utoipa::path(
    get,
    path = "/notifications",
    operation_id = "listNotifications",
    params(GetListQuery),
    responses(
        (status = 200, description = "One page of the tab, newest first", body = NotificationPage),
        (status = 400, description = "Malformed query, e.g. an invalid cursor"),
        (status = 401, description = "Unauthorized"),
        (status = 500, description = "Internal server error")
    ),
    tag = "Notifications"
)]
pub async fn get_list(
    State(pool): State<sqlx::PgPool>,
    ApiQuery(query): ApiQuery<GetListQuery>,
    Extension(user_id): Extension<Uuid>,
) -> Result<Json<NotificationPage>, ApiError> {
    let limit = query.limit();

    // One row more than asked tells whether there is a next page, without a COUNT
    let mut data =
        NotificationsRepository::list(&pool, user_id, query.view, limit + 1, query.cursor).await?;

    let next_cursor = if data.len() as i64 > limit {
        data.truncate(limit as usize);
        data.last()
            .map(|last| query.view.cursor_after(last).to_string())
    } else {
        None
    };

    Ok(Json(NotificationPage { data, next_cursor }))
}

#[cfg(test)]
mod tests {
    use axum::{extract::Query, http::Uri};

    use super::*;

    fn parse(qs: &str) -> Result<GetListQuery, String> {
        let uri: Uri = format!("/notifications?{qs}").parse().unwrap();
        Query::<GetListQuery>::try_from_uri(&uri)
            .map(|Query(q)| q)
            .map_err(|e| e.to_string())
    }

    #[test]
    fn defaults_to_the_first_fifty_unread() {
        let query = parse("").unwrap();

        assert_eq!(query.view, InboxView::Unread);
        assert_eq!(query.limit(), DEFAULT_LIMIT);
        assert_eq!(query.cursor, None);
    }

    #[test]
    fn keeps_the_limit_in_range() {
        let limit = |qs: &str| parse(qs).unwrap().limit();

        assert_eq!(limit("limit=20"), 20);
        assert_eq!(limit("limit=1000000"), MAX_LIMIT);
        assert_eq!(limit("limit=0"), 1);
        assert_eq!(limit("limit=-5"), 1);
    }

    #[test]
    fn reads_the_view_and_the_cursor() {
        let cursor = Cursor {
            at: chrono::DateTime::from_timestamp_micros(1_790_000_000_123_456).unwrap(),
            id: Uuid::nil(),
        };

        let query = parse(&format!("view=archived&cursor={cursor}")).unwrap();

        assert_eq!(query.view, InboxView::Archived);
        assert_eq!(query.cursor, Some(cursor));
    }

    #[test]
    fn rejects_an_unknown_view_or_a_broken_cursor() {
        assert!(parse("view=archive").is_err());
        assert!(parse("cursor=page-2").is_err());
    }
}
