use axum::{Extension, Json, extract::State};
use error_handlers::{ApiError, extract::ApiQuery};
use serde::{Deserialize, Serialize};
use sql_models::notification::model::Notification;
use utoipa::{IntoParams, ToSchema};
use uuid::Uuid;

use crate::notifications::{
    cursor::Cursor,
    repo::{InboxScope, InboxView, NotificationsRepository},
};
use crate::workspaces;

const DEFAULT_LIMIT: i64 = 50;
const MAX_LIMIT: i64 = 100;

#[derive(Debug, Deserialize, IntoParams)]
#[into_params(parameter_in = Query)]
pub struct GetListQuery {
    /// The workspace whose Inbox it is.
    pub workspace: Uuid,
    // `PageQuery`'s fields again, not `#[serde(flatten)]`: through flatten a query string
    // reaches serde as strings only, and `limit=20` would not parse as a number
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
    fn page(self) -> PageQuery {
        PageQuery {
            view: self.view,
            limit: self.limit,
            cursor: self.cursor,
        }
    }
}

/// The tab and the page, the same for a workspace's list and the account-level one.
#[derive(Debug, Default, Deserialize, IntoParams)]
#[into_params(parameter_in = Query)]
pub struct PageQuery {
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

impl PageQuery {
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
        (status = 400, description = "Malformed query: no workspace, an invalid cursor"),
        (status = 401, description = "Unauthorized"),
        (status = 404, description = "No such workspace for this user"),
        (status = 500, description = "Internal server error")
    ),
    tag = "Notifications"
)]
pub async fn get_list(
    State(pool): State<sqlx::PgPool>,
    ApiQuery(query): ApiQuery<GetListQuery>,
    Extension(user_id): Extension<Uuid>,
) -> Result<Json<NotificationPage>, ApiError> {
    workspaces::ensure_member(&pool, user_id, query.workspace).await?;

    let scope = InboxScope::Workspace(query.workspace);

    page(&pool, user_id, scope, query.page()).await
}

/// The account-level notifications (an invite, a new sign-in): every workspace's Inbox shows them
/// apart, as the Account group above Today (spec: Inbox · 01).
#[axum::debug_handler]
#[utoipa::path(
    get,
    path = "/notifications/account",
    operation_id = "listAccountNotifications",
    params(PageQuery),
    responses(
        (status = 200, description = "One page of the tab, newest first", body = NotificationPage),
        (status = 400, description = "Malformed query, e.g. an invalid cursor"),
        (status = 401, description = "Unauthorized"),
        (status = 500, description = "Internal server error")
    ),
    tag = "Notifications"
)]
pub async fn get_account_list(
    State(pool): State<sqlx::PgPool>,
    ApiQuery(query): ApiQuery<PageQuery>,
    Extension(user_id): Extension<Uuid>,
) -> Result<Json<NotificationPage>, ApiError> {
    page(&pool, user_id, InboxScope::Account, query).await
}

async fn page(
    pool: &sqlx::PgPool,
    user_id: Uuid,
    scope: InboxScope,
    query: PageQuery,
) -> Result<Json<NotificationPage>, ApiError> {
    let limit = query.limit();

    // One row more than asked tells whether there is a next page, without a COUNT
    let mut data =
        NotificationsRepository::list(pool, user_id, scope, query.view, limit + 1, query.cursor)
            .await?;

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

    const WS: &str = "00000000-0000-0000-0000-00000000000a";

    fn parse_list(qs: &str) -> Result<GetListQuery, String> {
        let uri: Uri = format!("/notifications?{qs}").parse().unwrap();
        Query::<GetListQuery>::try_from_uri(&uri)
            .map(|Query(q)| q)
            .map_err(|e| e.to_string())
    }

    /// The page part, through the workspace list as the frontend sends it.
    fn parse(qs: &str) -> Result<PageQuery, String> {
        let sep = if qs.is_empty() { "" } else { "&" };
        parse_list(&format!("workspace={WS}{sep}{qs}")).map(GetListQuery::page)
    }

    #[test]
    fn needs_a_workspace() {
        assert_eq!(
            parse_list(&format!("workspace={WS}")).unwrap().workspace,
            Uuid::from_u128(0x0a)
        );
        assert!(parse_list("view=all").is_err());
        assert!(parse_list("workspace=acme").is_err());
    }

    #[test]
    fn the_account_list_reads_the_same_page_query() {
        let uri: Uri = "/notifications/account?view=archived&limit=5"
            .parse()
            .unwrap();
        let Query(query) = Query::<PageQuery>::try_from_uri(&uri).unwrap();

        assert_eq!(query.view, InboxView::Archived);
        assert_eq!(query.limit(), 5);
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
