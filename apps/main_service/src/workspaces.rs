//! Workspaces as other modules see them. There is no workspaces table yet: every function here is
//! a stub that lets everything through, marked `TODO(workspaces)`. They are the only places to
//! change when workspaces land, so callers already ask the right questions.

use error_handlers::ApiError;
use uuid::Uuid;

/// Fails unless `user_id` may see `workspace_id`: a member of it, in any role. A space they are
/// not in is a 404, not a 403, so its id reveals nothing.
///
/// Losing access does not delete notifications, they are just not served while access is gone
/// (backend spec, notifications §8.2): every read of a workspace's notifications goes through here.
pub async fn ensure_member(
    _pool: &sqlx::PgPool,
    _user_id: Uuid,
    _workspace_id: Uuid,
) -> Result<(), ApiError> {
    // TODO(workspaces): look the membership up; `ApiError::new(ErrorCode::NotFound)` when there is none
    Ok(())
}

/// The workspaces `user_id` is a member of now, for counts across workspaces. `None` means "no
/// restriction" — only while the stub stands.
pub async fn member_workspace_ids(
    _pool: &sqlx::PgPool,
    _user_id: Uuid,
) -> Result<Option<Vec<Uuid>>, sqlx::Error> {
    // TODO(workspaces): return `Some(ids)` of the user's memberships
    Ok(None)
}
