use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use sql_models::notification::model::{Notification, NotificationKind};
use sqlx::AssertSqlSafe;
use utoipa::ToSchema;
use uuid::Uuid;

use crate::{notifications::cursor::Cursor, webhooks::authentik::user_sync};

pub struct NotificationsRepository;

#[derive(Debug, Deserialize, Serialize, ToSchema)]
#[serde(rename_all = "camelCase")]
pub struct CreateNotificationDto {
    pub user_id: Uuid,
    /// The workspace it belongs to; none for an account-level one (an invite, a new sign-in).
    #[serde(default)]
    pub workspace_id: Option<Uuid>,
    #[serde(flatten)]
    pub data: NotificationKind,
}

/// Whose notifications a list shows: a workspace's Inbox, or the account-level ones that every
/// workspace's Inbox shows apart, as the Account group above Today (spec: Inbox · 01).
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum InboxScope {
    Workspace(Uuid),
    Account,
}

impl InboxScope {
    /// `$n` is bound only for a workspace (see `list`).
    fn filter(self, n: usize) -> String {
        match self {
            Self::Workspace(_) => format!("workspace_id = ${n}"),
            Self::Account => "workspace_id IS NULL".into(),
        }
    }

    fn workspace_id(self) -> Option<Uuid> {
        match self {
            Self::Workspace(id) => Some(id),
            Self::Account => None,
        }
    }
}

/// Unread counts for the sidebar and the workspace menu.
#[derive(Debug, Default, PartialEq, Eq)]
pub struct UnreadCounts {
    pub by_workspace: Vec<(Uuid, i64)>,
    pub account: i64,
}

/// The Inbox tabs.
#[derive(Debug, Clone, Copy, Default, PartialEq, Eq, Deserialize, ToSchema)]
#[serde(rename_all = "lowercase")]
pub enum InboxView {
    /// Neither read nor done.
    #[default]
    Unread,
    /// Everything not done, read or not.
    All,
    /// Archived, newest done first.
    Archived,
}

impl InboxView {
    fn filter(self) -> &'static str {
        match self {
            Self::Unread => "read_at IS NULL AND archived_at IS NULL",
            Self::All => "archived_at IS NULL",
            Self::Archived => "archived_at IS NOT NULL",
        }
    }

    /// What the tab is sorted by, newest first; `id` breaks ties.
    fn sort_column(self) -> &'static str {
        match self {
            Self::Unread | Self::All => "updated_at",
            Self::Archived => "archived_at",
        }
    }

    /// The cursor that continues the list after `notification`.
    pub fn cursor_after(self, notification: &Notification) -> Cursor {
        let at = match self {
            Self::Unread | Self::All => notification.updated_at,
            Self::Archived => notification.archived_at.unwrap_or(notification.updated_at),
        };
        Cursor {
            at,
            id: notification.id,
        }
    }
}

// Every dynamic query below formats in only these constants and the fixed fragments of
// `InboxView` and `update` callers; values always go through binds. Hence `AssertSqlSafe`.
const COLUMNS: &str =
    "id, user_id, workspace_id, data, created_at, updated_at, read_at, archived_at";

impl NotificationsRepository {
    pub async fn list(
        pool: &sqlx::PgPool,
        user_id: Uuid,
        scope: InboxScope,
        view: InboxView,
        limit: i64,
        after: Option<Cursor>,
    ) -> Result<Vec<Notification>, sqlx::Error> {
        // Keyset pagination: rows strictly after the cursor in the tab's order. The row
        // comparison walks the (user_id, workspace_id, updated_at DESC, id DESC) index
        let sql = format!(
            "SELECT {COLUMNS} FROM notifications WHERE user_id = $1 AND {scope} AND {filter} AND ($3::timestamptz IS NULL OR ({sort}, id) < ($3, $4)) ORDER BY {sort} DESC, id DESC LIMIT $2",
            scope = scope.filter(5),
            filter = view.filter(),
            sort = view.sort_column(),
        );

        let query = sqlx::query_as::<_, Notification>(AssertSqlSafe(sql))
            .bind(user_id)
            .bind(limit)
            .bind(after.map(|c| c.at))
            .bind(after.map(|c| c.id));

        match scope.workspace_id() {
            Some(workspace_id) => query.bind(workspace_id),
            None => query,
        }
        .fetch_all(pool)
        .await
    }

    /// Keeps the first read time when it is read again.
    pub async fn mark_as_read(
        pool: &sqlx::PgPool,
        user_id: Uuid,
        ids: Vec<Uuid>,
    ) -> Result<(), sqlx::Error> {
        sqlx::query("UPDATE notifications SET read_at = COALESCE(read_at, NOW()) WHERE user_id = $1 AND id = ANY($2)")
            .bind(user_id)
            .bind(ids)
            .execute(pool)
            .await?;

        Ok(())
    }

    /// Reads one workspace's Inbox up to `before`: the other workspaces and the account-level
    /// notifications keep their unread.
    pub async fn mark_as_read_all(
        pool: &sqlx::PgPool,
        user_id: Uuid,
        workspace_id: Uuid,
        before: DateTime<Utc>,
    ) -> Result<Vec<Uuid>, sqlx::Error> {
        sqlx::query_scalar::<_, Uuid>(
            "UPDATE notifications
         SET read_at = NOW()
         WHERE user_id = $1 AND workspace_id = $3 AND read_at IS NULL AND archived_at IS NULL AND updated_at <= $2
         RETURNING id",
        )
        .bind(user_id)
        .bind(before)
        .bind(workspace_id)
        .fetch_all(pool)
        .await
    }

    pub async fn mark_as_unread(
        pool: &sqlx::PgPool,
        user_id: Uuid,
        ids: Vec<Uuid>,
    ) -> Result<(), sqlx::Error> {
        sqlx::query("UPDATE notifications SET read_at = NULL WHERE user_id = $1 AND id = ANY($2)")
            .bind(user_id)
            .bind(ids)
            .execute(pool)
            .await?;

        Ok(())
    }

    /// Done implies read.
    pub async fn archive(pool: &sqlx::PgPool, user_id: Uuid, id: Uuid) -> Result<(), sqlx::Error> {
        Self::update(
            pool,
            user_id,
            id,
            "archived_at = COALESCE(archived_at, NOW()), read_at = COALESCE(read_at, NOW())",
        )
        .await
    }

    /// Back to the Inbox; whether it was read stays as it is.
    pub async fn unarchive(
        pool: &sqlx::PgPool,
        user_id: Uuid,
        id: Uuid,
    ) -> Result<(), sqlx::Error> {
        Self::update(pool, user_id, id, "archived_at = NULL").await
    }

    /// Changes one notification of `user_id`. Someone else's or a missing one is `RowNotFound`
    /// (a 404), so ids of other people's notifications reveal nothing.
    async fn update(
        pool: &sqlx::PgPool,
        user_id: Uuid,
        id: Uuid,
        set: &'static str,
    ) -> Result<(), sqlx::Error> {
        let sql =
            format!("UPDATE notifications SET {set} WHERE id = $1 AND user_id = $2 RETURNING id");

        sqlx::query_scalar::<_, Uuid>(AssertSqlSafe(sql))
            .bind(id)
            .bind(user_id)
            .fetch_one(pool)
            .await?;
        Ok(())
    }

    /// What the Unread tabs show, per workspace and for the account. `members` limits the
    /// workspaces to those the user is in now; `None` counts every workspace.
    pub async fn count_unread(
        pool: &sqlx::PgPool,
        user_id: Uuid,
        members: Option<&[Uuid]>,
    ) -> Result<UnreadCounts, sqlx::Error> {
        let rows: Vec<(Option<Uuid>, i64)> = sqlx::query_as(
            "SELECT workspace_id, COUNT(*) FROM notifications
             WHERE user_id = $1 AND read_at IS NULL AND archived_at IS NULL
               AND (workspace_id IS NULL OR $2::uuid[] IS NULL OR workspace_id = ANY($2))
             GROUP BY workspace_id",
        )
        .bind(user_id)
        .bind(members)
        .fetch_all(pool)
        .await?;

        let mut counts = UnreadCounts::default();

        for (workspace_id, count) in rows {
            match workspace_id {
                Some(id) => counts.by_workspace.push((id, count)),
                None => counts.account = count,
            }
        }

        counts.by_workspace.sort();

        Ok(counts)
    }

    pub async fn create(
        pool: &sqlx::PgPool,
        dto: CreateNotificationDto,
    ) -> Result<Notification, sqlx::Error> {
        let sql = format!(
            "INSERT INTO notifications (user_id, workspace_id, data) VALUES ($1, $2, $3) RETURNING {COLUMNS}"
        );

        sqlx::query_as::<_, Notification>(AssertSqlSafe(sql))
            .bind(dto.user_id)
            .bind(dto.workspace_id)
            .bind(sqlx::types::Json(dto.data))
            .fetch_one(pool)
            .await
    }
}

// Needs a disposable Postgres; `#[sqlx::test]` creates a fresh database per test there:
//   DATABASE_URL=postgres://test:test@127.0.0.1:55432/postgres cargo test -p main_service -- --ignored
// Never point it at a shared database.
#[cfg(test)]
mod tests {
    use sqlx::PgPool;

    use super::*;

    /// The workspace the tests' notifications are in, unless a test says otherwise.
    const WS: Uuid = Uuid::from_u128(0x0a);

    async fn user(pool: &PgPool) -> Uuid {
        let id = Uuid::now_v7();
        sqlx::query("INSERT INTO users (id, username) VALUES ($1, 'test')")
            .bind(id)
            .execute(pool)
            .await
            .unwrap();
        id
    }

    async fn notify(pool: &PgPool, user_id: Uuid, message: &str) -> Notification {
        notify_in(pool, user_id, Some(WS), message).await
    }

    /// In `workspace_id`, or account-level for `None`.
    async fn notify_in(
        pool: &PgPool,
        user_id: Uuid,
        workspace_id: Option<Uuid>,
        message: &str,
    ) -> Notification {
        let data = NotificationKind::Debug {
            message: message.into(),
        };
        NotificationsRepository::create(
            pool,
            CreateNotificationDto {
                user_id,
                workspace_id,
                data,
            },
        )
        .await
        .unwrap()
    }

    /// Moves the event time, which lists sort by.
    async fn happened_minutes_ago(pool: &PgPool, id: Uuid, minutes: i32) {
        sqlx::query(
            "UPDATE notifications SET updated_at = NOW() - make_interval(mins => $2) WHERE id = $1",
        )
        .bind(id)
        .bind(minutes)
        .execute(pool)
        .await
        .unwrap();
    }

    /// Moves both the arrival and the event time: a notification with a single event.
    async fn arrived_minutes_ago(pool: &PgPool, id: Uuid, minutes: i32) {
        sqlx::query(
            "UPDATE notifications SET created_at = NOW() - make_interval(mins => $2), \
             updated_at = NOW() - make_interval(mins => $2) WHERE id = $1",
        )
        .bind(id)
        .bind(minutes)
        .execute(pool)
        .await
        .unwrap();
    }

    fn minutes_ago(minutes: i64) -> DateTime<Utc> {
        Utc::now() - chrono::Duration::minutes(minutes)
    }

    async fn messages(pool: &PgPool, user_id: Uuid, view: InboxView) -> Vec<String> {
        messages_in(pool, user_id, InboxScope::Workspace(WS), view).await
    }

    async fn messages_in(
        pool: &PgPool,
        user_id: Uuid,
        scope: InboxScope,
        view: InboxView,
    ) -> Vec<String> {
        NotificationsRepository::list(pool, user_id, scope, view, 50, None)
            .await
            .unwrap()
            .into_iter()
            .map(|n| match n.data {
                NotificationKind::Debug { message } => message,
                other => panic!("unexpected {other:?}"),
            })
            .collect()
    }

    async fn get(pool: &PgPool, id: Uuid) -> Notification {
        let sql = format!("SELECT {COLUMNS} FROM notifications WHERE id = $1");
        sqlx::query_as(AssertSqlSafe(sql))
            .bind(id)
            .fetch_one(pool)
            .await
            .unwrap()
    }

    #[sqlx::test(migrations = "./migrations")]
    #[ignore = "needs DATABASE_URL to a disposable Postgres"]
    async fn creates_an_unread_notification_and_derives_its_kind(pool: PgPool) {
        let user_id = user(&pool).await;

        let created = notify(&pool, user_id, "hello").await;

        assert_eq!(created.user_id, user_id);
        // uuidv7() as the column default (PostgreSQL 18)
        assert_eq!(created.id.get_version_num(), 7);
        assert_eq!(created.workspace_id, Some(WS));
        assert_eq!(created.read_at, None);
        assert_eq!(created.archived_at, None);
        assert!(matches!(&created.data, NotificationKind::Debug { message } if message == "hello"));

        let kind: String = sqlx::query_scalar("SELECT kind FROM notifications WHERE id = $1")
            .bind(created.id)
            .fetch_one(&pool)
            .await
            .unwrap();
        assert_eq!(kind, "debug");
    }

    #[sqlx::test(migrations = "./migrations")]
    #[ignore = "needs DATABASE_URL to a disposable Postgres"]
    async fn refuses_a_notification_for_a_user_that_does_not_exist(pool: PgPool) {
        let dto = CreateNotificationDto {
            user_id: Uuid::now_v7(),
            workspace_id: None,
            data: NotificationKind::Assigned {},
        };

        let err = NotificationsRepository::create(&pool, dto)
            .await
            .unwrap_err();

        assert!(matches!(&err, sqlx::Error::Database(db) if db.is_foreign_key_violation()));
    }

    #[sqlx::test(migrations = "./migrations")]
    #[ignore = "needs DATABASE_URL to a disposable Postgres"]
    async fn lists_only_the_users_own_notifications_newest_event_first(pool: PgPool) {
        let me = user(&pool).await;
        let someone = user(&pool).await;
        let old = notify(&pool, me, "old").await;
        let new = notify(&pool, me, "new").await;
        notify(&pool, someone, "not mine").await;
        happened_minutes_ago(&pool, old.id, 30).await;
        happened_minutes_ago(&pool, new.id, 5).await;

        assert_eq!(messages(&pool, me, InboxView::All).await, ["new", "old"]);
    }

    #[sqlx::test(migrations = "./migrations")]
    #[ignore = "needs DATABASE_URL to a disposable Postgres"]
    async fn tabs_split_unread_read_and_done(pool: PgPool) {
        let me = user(&pool).await;
        let unread = notify(&pool, me, "unread").await;
        let read = notify(&pool, me, "read").await;
        let done = notify(&pool, me, "done").await;
        happened_minutes_ago(&pool, unread.id, 1).await;
        happened_minutes_ago(&pool, read.id, 2).await;
        happened_minutes_ago(&pool, done.id, 3).await;
        NotificationsRepository::mark_as_read(&pool, me, vec![read.id])
            .await
            .unwrap();
        NotificationsRepository::archive(&pool, me, done.id)
            .await
            .unwrap();

        assert_eq!(messages(&pool, me, InboxView::Unread).await, ["unread"]);
        assert_eq!(
            messages(&pool, me, InboxView::All).await,
            ["unread", "read"]
        );
        assert_eq!(messages(&pool, me, InboxView::Archived).await, ["done"]);
    }

    #[sqlx::test(migrations = "./migrations")]
    #[ignore = "needs DATABASE_URL to a disposable Postgres"]
    async fn done_lists_the_last_done_first(pool: PgPool) {
        let me = user(&pool).await;
        let first = notify(&pool, me, "done first").await;
        let second = notify(&pool, me, "done second").await;
        NotificationsRepository::archive(&pool, me, first.id)
            .await
            .unwrap();
        sqlx::query(
            "UPDATE notifications SET archived_at = archived_at - interval '1 hour' WHERE id = $1",
        )
        .bind(first.id)
        .execute(&pool)
        .await
        .unwrap();
        NotificationsRepository::archive(&pool, me, second.id)
            .await
            .unwrap();

        assert_eq!(
            messages(&pool, me, InboxView::Archived).await,
            ["done second", "done first"]
        );
    }

    #[sqlx::test(migrations = "./migrations")]
    #[ignore = "needs DATABASE_URL to a disposable Postgres"]
    async fn pages_through_the_list_by_cursor(pool: PgPool) {
        let me = user(&pool).await;
        for (message, minutes) in [("n1", 10), ("n2", 20), ("n3", 30)] {
            let n = notify(&pool, me, message).await;
            happened_minutes_ago(&pool, n.id, minutes).await;
        }

        let first = NotificationsRepository::list(
            &pool,
            me,
            InboxScope::Workspace(WS),
            InboxView::All,
            2,
            None,
        )
        .await
        .unwrap();
        // Something new arrives at the top between the pages
        notify(&pool, me, "newest").await;
        let after = InboxView::All.cursor_after(first.last().unwrap());
        let second = NotificationsRepository::list(
            &pool,
            me,
            InboxScope::Workspace(WS),
            InboxView::All,
            2,
            Some(after),
        )
        .await
        .unwrap();

        let ids = |page: &[Notification]| page.iter().map(|n| n.id).collect::<Vec<_>>();
        assert_eq!(first.len(), 2);
        assert_eq!(second.len(), 1);
        assert!(ids(&second).iter().all(|id| !ids(&first).contains(id)));
        assert!(matches!(&second[0].data, NotificationKind::Debug { message } if message == "n3"));
    }

    #[sqlx::test(migrations = "./migrations")]
    #[ignore = "needs DATABASE_URL to a disposable Postgres"]
    async fn ties_on_time_are_broken_by_id_without_losing_rows(pool: PgPool) {
        let me = user(&pool).await;
        for i in 0..5 {
            notify(&pool, me, &format!("n{i}")).await;
        }
        sqlx::query("UPDATE notifications SET updated_at = '2026-10-03T10:00:00Z'")
            .execute(&pool)
            .await
            .unwrap();

        let mut seen = Vec::new();
        let mut after = None;
        loop {
            let page = NotificationsRepository::list(
                &pool,
                me,
                InboxScope::Workspace(WS),
                InboxView::All,
                2,
                after,
            )
            .await
            .unwrap();
            let Some(last) = page.last() else { break };
            after = Some(InboxView::All.cursor_after(last));
            seen.extend(page.iter().map(|n| n.id));
        }

        let mut unique = seen.clone();
        unique.sort();
        unique.dedup();
        assert_eq!(seen.len(), 5);
        assert_eq!(unique.len(), 5);
    }

    #[sqlx::test(migrations = "./migrations")]
    #[ignore = "needs DATABASE_URL to a disposable Postgres"]
    async fn the_done_tab_pages_by_the_time_it_was_done(pool: PgPool) {
        let me = user(&pool).await;
        let a = notify(&pool, me, "done first").await;
        let b = notify(&pool, me, "done second").await;
        NotificationsRepository::archive(&pool, me, a.id)
            .await
            .unwrap();
        sqlx::query(
            "UPDATE notifications SET archived_at = archived_at - interval '1 hour' WHERE id = $1",
        )
        .bind(a.id)
        .execute(&pool)
        .await
        .unwrap();
        NotificationsRepository::archive(&pool, me, b.id)
            .await
            .unwrap();

        let first = NotificationsRepository::list(
            &pool,
            me,
            InboxScope::Workspace(WS),
            InboxView::Archived,
            1,
            None,
        )
        .await
        .unwrap();
        let after = InboxView::Archived.cursor_after(&first[0]);
        let second = NotificationsRepository::list(
            &pool,
            me,
            InboxScope::Workspace(WS),
            InboxView::Archived,
            1,
            Some(after),
        )
        .await
        .unwrap();

        assert_eq!(first[0].id, b.id);
        assert_eq!(second[0].id, a.id);
    }

    #[sqlx::test(migrations = "./migrations")]
    #[ignore = "needs DATABASE_URL to a disposable Postgres"]
    async fn reading_again_keeps_the_first_read_time_and_unread_clears_it(pool: PgPool) {
        let me = user(&pool).await;
        let n = notify(&pool, me, "hello").await;

        NotificationsRepository::mark_as_read(&pool, me, vec![n.id])
            .await
            .unwrap();
        let first = get(&pool, n.id).await.read_at.expect("read");
        NotificationsRepository::mark_as_read(&pool, me, vec![n.id])
            .await
            .unwrap();
        assert_eq!(get(&pool, n.id).await.read_at, Some(first));

        NotificationsRepository::mark_as_unread(&pool, me, vec![n.id])
            .await
            .unwrap();
        assert_eq!(get(&pool, n.id).await.read_at, None);
    }

    #[sqlx::test(migrations = "./migrations")]
    #[ignore = "needs DATABASE_URL to a disposable Postgres"]
    async fn read_all_reads_the_unread_before_the_moment_and_returns_exactly_them(pool: PgPool) {
        let me = user(&pool).await;
        let first = notify(&pool, me, "first").await;
        let second = notify(&pool, me, "second").await;
        let already_read = notify(&pool, me, "already read").await;
        for n in [&first, &second, &already_read] {
            arrived_minutes_ago(&pool, n.id, 30).await;
        }
        NotificationsRepository::mark_as_read(&pool, me, vec![already_read.id])
            .await
            .unwrap();
        let first_read = get(&pool, already_read.id).await.read_at;

        let mut ids = NotificationsRepository::mark_as_read_all(&pool, me, WS, minutes_ago(10))
            .await
            .unwrap();

        ids.sort();
        let mut expected = vec![first.id, second.id];
        expected.sort();
        assert_eq!(ids, expected);
        assert!(messages(&pool, me, InboxView::Unread).await.is_empty());
        // Not in the result, so an undo of this read-all will not unread it
        assert_eq!(get(&pool, already_read.id).await.read_at, first_read);
    }

    #[sqlx::test(migrations = "./migrations")]
    #[ignore = "needs DATABASE_URL to a disposable Postgres"]
    async fn read_all_leaves_what_arrived_after_the_moment_unread(pool: PgPool) {
        let me = user(&pool).await;
        let seen = notify(&pool, me, "seen").await;
        arrived_minutes_ago(&pool, seen.id, 30).await;
        notify(&pool, me, "arrived later").await;

        let ids = NotificationsRepository::mark_as_read_all(&pool, me, WS, minutes_ago(10))
            .await
            .unwrap();

        assert_eq!(ids, [seen.id]);
        assert_eq!(
            messages(&pool, me, InboxView::Unread).await,
            ["arrived later"]
        );
    }

    /// Spec (Inbox · read all): only what is seen at the moment. A notification merged with a
    /// new event after it was seen is new again, and the list sorts it by that event.
    #[sqlx::test(migrations = "./migrations")]
    #[ignore = "needs DATABASE_URL to a disposable Postgres"]
    async fn read_all_leaves_a_notification_with_a_newer_event_unread(pool: PgPool) {
        let me = user(&pool).await;
        let n = notify(&pool, me, "merged").await;
        arrived_minutes_ago(&pool, n.id, 30).await;
        happened_minutes_ago(&pool, n.id, 5).await;

        let ids = NotificationsRepository::mark_as_read_all(&pool, me, WS, minutes_ago(10))
            .await
            .unwrap();

        assert!(ids.is_empty());
        assert_eq!(get(&pool, n.id).await.read_at, None);
    }

    #[sqlx::test(migrations = "./migrations")]
    #[ignore = "needs DATABASE_URL to a disposable Postgres"]
    async fn read_all_does_not_touch_someone_elses(pool: PgPool) {
        let me = user(&pool).await;
        let someone = user(&pool).await;
        let theirs = notify(&pool, someone, "theirs").await;
        arrived_minutes_ago(&pool, theirs.id, 30).await;

        let ids = NotificationsRepository::mark_as_read_all(&pool, me, WS, minutes_ago(10))
            .await
            .unwrap();

        assert!(ids.is_empty());
        assert_eq!(get(&pool, theirs.id).await.read_at, None);
    }

    #[sqlx::test(migrations = "./migrations")]
    #[ignore = "needs DATABASE_URL to a disposable Postgres"]
    async fn undoing_read_all_unreads_only_what_it_read(pool: PgPool) {
        let me = user(&pool).await;
        let unread = notify(&pool, me, "unread").await;
        let already_read = notify(&pool, me, "already read").await;
        for n in [&unread, &already_read] {
            arrived_minutes_ago(&pool, n.id, 30).await;
        }
        NotificationsRepository::mark_as_read(&pool, me, vec![already_read.id])
            .await
            .unwrap();

        let ids = NotificationsRepository::mark_as_read_all(&pool, me, WS, minutes_ago(10))
            .await
            .unwrap();
        NotificationsRepository::mark_as_unread(&pool, me, ids)
            .await
            .unwrap();

        assert_eq!(get(&pool, unread.id).await.read_at, None);
        assert!(get(&pool, already_read.id).await.read_at.is_some());
    }

    #[sqlx::test(migrations = "./migrations")]
    #[ignore = "needs DATABASE_URL to a disposable Postgres"]
    async fn done_implies_read_and_moving_back_keeps_it_read(pool: PgPool) {
        let me = user(&pool).await;
        let n = notify(&pool, me, "hello").await;

        NotificationsRepository::archive(&pool, me, n.id)
            .await
            .unwrap();
        let archived = get(&pool, n.id).await;
        assert!(archived.archived_at.is_some());
        assert!(archived.read_at.is_some());

        NotificationsRepository::unarchive(&pool, me, n.id)
            .await
            .unwrap();
        let back = get(&pool, n.id).await;
        assert_eq!(back.archived_at, None);
        assert_eq!(back.read_at, archived.read_at);
    }

    #[sqlx::test(migrations = "./migrations")]
    #[ignore = "needs DATABASE_URL to a disposable Postgres"]
    async fn reading_or_archiving_does_not_move_it_in_the_list(pool: PgPool) {
        let me = user(&pool).await;
        let n = notify(&pool, me, "hello").await;
        happened_minutes_ago(&pool, n.id, 30).await;
        let before = get(&pool, n.id).await.updated_at;

        NotificationsRepository::mark_as_read(&pool, me, vec![n.id])
            .await
            .unwrap();
        NotificationsRepository::archive(&pool, me, n.id)
            .await
            .unwrap();

        assert_eq!(get(&pool, n.id).await.updated_at, before);
    }

    #[sqlx::test(migrations = "./migrations")]
    #[ignore = "needs DATABASE_URL to a disposable Postgres"]
    async fn someone_elses_or_a_missing_notification_is_not_found_and_stays_untouched(
        pool: PgPool,
    ) {
        let me = user(&pool).await;
        let someone = user(&pool).await;
        let theirs = notify(&pool, someone, "theirs").await;

        for result in [
            NotificationsRepository::archive(&pool, me, theirs.id).await,
            NotificationsRepository::unarchive(&pool, me, theirs.id).await,
            NotificationsRepository::archive(&pool, me, Uuid::now_v7()).await,
        ] {
            assert!(matches!(result, Err(sqlx::Error::RowNotFound)));
        }

        let untouched = get(&pool, theirs.id).await;
        assert_eq!(untouched.read_at, None);
        assert_eq!(untouched.archived_at, None);
    }

    /// A batch (read-all, its undo and redo) skips ids that are not the user's instead of failing
    /// whole.
    #[sqlx::test(migrations = "./migrations")]
    #[ignore = "needs DATABASE_URL to a disposable Postgres"]
    async fn read_and_unread_skip_someone_elses_and_missing_ids_and_leave_them_untouched(
        pool: PgPool,
    ) {
        let me = user(&pool).await;
        let someone = user(&pool).await;
        let theirs = notify(&pool, someone, "theirs").await;

        NotificationsRepository::mark_as_read(&pool, me, vec![theirs.id, Uuid::now_v7()])
            .await
            .unwrap();
        assert_eq!(get(&pool, theirs.id).await.read_at, None);

        NotificationsRepository::mark_as_read(&pool, someone, vec![theirs.id])
            .await
            .unwrap();
        let read_at = get(&pool, theirs.id).await.read_at;

        NotificationsRepository::mark_as_unread(&pool, me, vec![theirs.id, Uuid::now_v7()])
            .await
            .unwrap();
        assert_eq!(get(&pool, theirs.id).await.read_at, read_at);
    }

    #[sqlx::test(migrations = "./migrations")]
    #[ignore = "needs DATABASE_URL to a disposable Postgres"]
    async fn counts_what_the_unread_tab_shows(pool: PgPool) {
        let me = user(&pool).await;
        let someone = user(&pool).await;
        notify(&pool, me, "unread").await;
        let read = notify(&pool, me, "read").await;
        let done = notify(&pool, me, "done").await;
        notify(&pool, someone, "not mine").await;
        NotificationsRepository::mark_as_read(&pool, me, vec![read.id])
            .await
            .unwrap();
        NotificationsRepository::archive(&pool, me, done.id)
            .await
            .unwrap();

        let counts = NotificationsRepository::count_unread(&pool, me, None)
            .await
            .unwrap();

        assert_eq!(counts.by_workspace, [(WS, 1)]);
        assert_eq!(counts.account, 0);
        assert_eq!(1, messages(&pool, me, InboxView::Unread).await.len());
    }

    #[sqlx::test(migrations = "./migrations")]
    #[ignore = "needs DATABASE_URL to a disposable Postgres"]
    async fn a_workspace_lists_only_its_own_and_the_account_list_only_the_account_level(
        pool: PgPool,
    ) {
        let me = user(&pool).await;
        let other = Uuid::from_u128(0x0b);
        notify(&pool, me, "here").await;
        notify_in(&pool, me, Some(other), "elsewhere").await;
        notify_in(&pool, me, None, "invite").await;

        let list = |scope| messages_in(&pool, me, scope, InboxView::All);

        assert_eq!(list(InboxScope::Workspace(WS)).await, ["here"]);
        assert_eq!(list(InboxScope::Workspace(other)).await, ["elsewhere"]);
        assert_eq!(list(InboxScope::Account).await, ["invite"]);
    }

    #[sqlx::test(migrations = "./migrations")]
    #[ignore = "needs DATABASE_URL to a disposable Postgres"]
    async fn read_all_reads_one_workspace_and_leaves_the_others_and_the_account_unread(
        pool: PgPool,
    ) {
        let me = user(&pool).await;
        let other = Uuid::from_u128(0x0b);
        let here = notify(&pool, me, "here").await;
        let elsewhere = notify_in(&pool, me, Some(other), "elsewhere").await;
        let invite = notify_in(&pool, me, None, "invite").await;
        for n in [&here, &elsewhere, &invite] {
            arrived_minutes_ago(&pool, n.id, 20).await;
        }

        let ids = NotificationsRepository::mark_as_read_all(&pool, me, WS, minutes_ago(10))
            .await
            .unwrap();

        assert_eq!(ids, [here.id]);
        assert_eq!(get(&pool, elsewhere.id).await.read_at, None);
        assert_eq!(get(&pool, invite.id).await.read_at, None);
    }

    #[sqlx::test(migrations = "./migrations")]
    #[ignore = "needs DATABASE_URL to a disposable Postgres"]
    async fn counts_unread_per_workspace_and_for_the_account_within_the_members_workspaces(
        pool: PgPool,
    ) {
        let me = user(&pool).await;
        let other = Uuid::from_u128(0x0b);
        notify(&pool, me, "a").await;
        notify(&pool, me, "b").await;
        notify_in(&pool, me, Some(other), "c").await;
        notify_in(&pool, me, None, "invite").await;

        let all = NotificationsRepository::count_unread(&pool, me, None)
            .await
            .unwrap();
        assert_eq!(all.by_workspace, [(WS, 2), (other, 1)]);
        assert_eq!(all.account, 1);

        // A workspace the user left is not counted; the account-level ones always are
        let members = NotificationsRepository::count_unread(&pool, me, Some(&[WS]))
            .await
            .unwrap();
        assert_eq!(members.by_workspace, [(WS, 2)]);
        assert_eq!(members.account, 1);
    }

    #[sqlx::test(migrations = "./migrations")]
    #[ignore = "needs DATABASE_URL to a disposable Postgres"]
    async fn deleting_a_user_deletes_their_notifications(pool: PgPool) {
        let me = user(&pool).await;
        notify(&pool, me, "hello").await;

        sqlx::query("DELETE FROM users WHERE id = $1")
            .bind(me)
            .execute(&pool)
            .await
            .unwrap();

        let left: i64 = sqlx::query_scalar("SELECT COUNT(*) FROM notifications")
            .fetch_one(&pool)
            .await
            .unwrap();
        assert_eq!(left, 0);
    }
}
