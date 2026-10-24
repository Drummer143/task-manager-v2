use chrono::{DateTime, SecondsFormat, Utc};
use error_handlers::{ApiError, EditedField, ErrorCode, FieldError};
use sql_models::page::model::{Page, PageIcon, PageType};
use sqlx::PgConnection;
use uuid::Uuid;

use crate::{
    changes::{
        self,
        dto::{Entity, FieldChange, FieldConflict},
    },
    pages::{
        dto::{PageAccess, fields},
        position,
        repo::{self, PageFields},
    },
    workspaces::middleware::WorkspaceContext,
};

pub const TITLE_MAX_LEN: u64 = 200;

/// A page at the root is at depth 1 (pages spec §1).
pub const MAX_DEPTH: i32 = 12;

/// The longest emoji sequences (families, flags with modifiers) stay well under this.
const EMOJI_MAX_LEN: usize = 32;
const LUCIDE_MAX_LEN: usize = 64;

/// The user's access to the workspace's pages, `None` when they see none. Until pages have their
/// own grants (TODO → Pages): every member with a role has Full access to every page; a guest
/// (no role) only has what is granted to them, which is nothing yet. Every page route asks here,
/// so grants will change only this.
pub fn access(ctx: &WorkspaceContext) -> Option<PageAccess> {
    (!ctx.is_guest()).then_some(PageAccess::Full)
}

/// `access`, or `404`: a page the user does not see does not exist for them.
pub fn ensure_access(ctx: &WorkspaceContext) -> Result<PageAccess, ApiError> {
    access(ctx).ok_or_else(|| ApiError::new(ErrorCode::NotFound))
}

/// The title as stored: trimmed, at most `TITLE_MAX_LEN` characters.
pub fn validate_title(title: &str) -> Result<(), ErrorCode> {
    if title.chars().count() as u64 > TITLE_MAX_LEN {
        Err(ErrorCode::ValueTooLong { max: TITLE_MAX_LEN })
    } else {
        Ok(())
    }
}

/// An emoji or a Lucide name. An uploaded image is refused: there is no picker for it yet, nor a
/// check that the asset belongs to the workspace.
pub fn validate_icon(icon: &PageIcon) -> Result<(), ErrorCode> {
    let fits = match icon {
        PageIcon::Emoji(emoji) => !emoji.trim().is_empty() && emoji.len() <= EMOJI_MAX_LEN,
        PageIcon::Lucide(name) => {
            !name.is_empty()
                && name.len() <= LUCIDE_MAX_LEN
                && name
                    .bytes()
                    .all(|byte| byte.is_ascii_lowercase() || byte.is_ascii_digit() || byte == b'-')
        }
        PageIcon::Asset(_) => false,
    };

    if fits {
        Ok(())
    } else {
        Err(ErrorCode::InvalidFormat)
    }
}

/// The parent a page goes under: live, in this workspace. Its depth, and whether `moved` is the
/// parent itself or one of its ancestors (a page cannot go under itself).
pub async fn check_parent(
    tx: &mut PgConnection,
    workspace_id: Uuid,
    parent_id: Uuid,
    moved: Option<Uuid>,
) -> Result<i32, ApiError> {
    let parent = repo::get(&mut *tx, parent_id).await?;
    let live = parent
        .is_some_and(|parent| parent.workspace_id == workspace_id && parent.deleted_at.is_none());
    if !live {
        return Err(ApiError::validation(vec![FieldError::new(
            fields::PARENT_ID,
            ErrorCode::NotFound,
        )]));
    }

    let path = repo::path_to_root(&mut *tx, parent_id).await?;
    if moved.is_some_and(|moved| path.contains(&moved)) {
        return Err(ApiError::new(ErrorCode::PageCycle));
    }

    Ok(path.len() as i32)
}

pub fn too_deep() -> ApiError {
    ApiError::new(ErrorCode::PageTooDeep {
        max: MAX_DEPTH as u64,
    })
}

/// A key for a page going to `index` among the live children of `parent_id` (all of them but
/// `except`, the page itself when it moves); `None` puts it last. Holds the children's order until
/// the transaction ends. When there is no room at that place, the children get new keys.
pub async fn place(
    tx: &mut PgConnection,
    workspace_id: Uuid,
    parent_id: Option<Uuid>,
    index: Option<usize>,
    except: Option<Uuid>,
) -> Result<String, ApiError> {
    repo::lock_children(&mut *tx, workspace_id, parent_id).await?;
    let children = repo::children(&mut *tx, workspace_id, parent_id, except).await?;

    let index = index.unwrap_or(children.len()).min(children.len());
    let before = index
        .checked_sub(1)
        .map(|before| children[before].1.as_str());
    let after = children.get(index).map(|(_, key)| key.as_str());

    if let Some(key) = position::between(before, after) {
        return Ok(key);
    }

    let mut keys = position::spread(children.len() + 1);
    let key = keys.remove(index);
    let renumbered: Vec<(Uuid, String)> =
        children.into_iter().map(|(id, _)| id).zip(keys).collect();
    repo::set_positions(&mut *tx, &renumbered).await?;

    Ok(key)
}

/// The fields of the edit sent that someone else changed after `base_version`, as a `409`; or
/// `base_version` is from the future.
pub async fn check_conflicts(
    tx: &mut PgConnection,
    current: &Page,
    base_version: i64,
    sent: &[&str],
) -> Result<(), ApiError> {
    if base_version > current.version {
        return Err(ApiError::validation(vec![FieldError::new(
            "baseVersion",
            ErrorCode::InvalidFormat,
        )]));
    }

    let found =
        changes::repo::conflicts(&mut *tx, Entity::Page, current.id, base_version, sent).await?;
    if found.is_empty() {
        Ok(())
    } else {
        Err(edit_conflict(found))
    }
}

fn edit_conflict(found: Vec<FieldConflict>) -> ApiError {
    ApiError::new(ErrorCode::EditConflict {
        conflicts: found
            .into_iter()
            .map(|conflict| EditedField {
                field: conflict.field,
                by: conflict.by.map(|by| by.to_string()),
                at: conflict.at.to_rfc3339_opts(SecondsFormat::Secs, true),
            })
            .collect(),
    })
}

/// A page's fields as a change leaves them: start from the current ones and set what the change
/// sets.
#[derive(Debug, Clone, PartialEq)]
pub struct PageState {
    pub parent_id: Option<Uuid>,
    pub position: String,
    pub r#type: PageType,
    pub title: String,
    pub icon: Option<PageIcon>,
    pub deleted_at: Option<DateTime<Utc>>,
    pub deleted_root: Option<Uuid>,
}

impl From<&Page> for PageState {
    fn from(page: &Page) -> Self {
        Self {
            parent_id: page.parent_id,
            position: page.position.clone(),
            r#type: page.r#type,
            title: page.title.clone(),
            icon: page.icon.as_ref().map(|icon| icon.0.clone()),
            deleted_at: page.deleted_at,
            deleted_root: page.deleted_root,
        }
    }
}

impl PageState {
    /// The fields that differ from `current`, with both values, as the history keeps them.
    /// `deleted_root` goes with `deleted_at` and is not history of its own.
    pub fn diff(&self, current: &Page) -> Vec<FieldChange> {
        let current = PageState::from(current);

        [
            FieldChange::if_changed(fields::TITLE, &current.title, &self.title),
            FieldChange::if_changed(fields::ICON, &current.icon, &self.icon),
            FieldChange::if_changed(fields::TYPE, &current.r#type, &self.r#type),
            FieldChange::if_changed(fields::PARENT_ID, &current.parent_id, &self.parent_id),
            FieldChange::if_changed(fields::POSITION, &current.position, &self.position),
            FieldChange::if_changed(fields::DELETED_AT, &current.deleted_at, &self.deleted_at),
        ]
        .into_iter()
        .flatten()
        .collect()
    }
}

/// Writes `next` over `current`, which the transaction `tx` has locked (`repo::lock`). Every
/// change of a page goes through here — edit, move, delete, restore — and gets the same: a new
/// `version`, `updated_at` and `updated_by`, and each changed field in the history.
///
/// `None` when `next` changes nothing: nothing is written, the version stays.
pub async fn update_page(
    tx: &mut PgConnection,
    current: &Page,
    next: PageState,
    actor_id: Uuid,
) -> Result<Option<Page>, ApiError> {
    let diff = next.diff(current);
    if diff.is_empty() && next.deleted_root == current.deleted_root {
        return Ok(None);
    }

    let updated = repo::update(
        &mut *tx,
        current.id,
        PageFields {
            parent_id: next.parent_id,
            position: &next.position,
            r#type: next.r#type,
            title: &next.title,
            icon: next.icon.as_ref(),
            deleted_at: next.deleted_at,
            deleted_root: next.deleted_root,
        },
        actor_id,
    )
    .await?;

    changes::repo::record(
        &mut *tx,
        Entity::Page,
        current.id,
        updated.version,
        actor_id,
        Some(current.workspace_id),
        &diff,
    )
    .await?;

    Ok(Some(updated))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn a_title_is_at_most_200_characters_not_bytes() {
        assert!(validate_title(&"я".repeat(200)).is_ok());
        assert!(validate_title(&"я".repeat(201)).is_err());
    }

    #[test]
    fn an_icon_is_an_emoji_or_a_lucide_name_not_yet_an_upload() {
        assert!(validate_icon(&PageIcon::Emoji("📘".into())).is_ok());
        assert!(validate_icon(&PageIcon::Emoji(" ".into())).is_err());
        assert!(validate_icon(&PageIcon::Lucide("file-text".into())).is_ok());
        assert!(validate_icon(&PageIcon::Lucide("File Text".into())).is_err());
        assert!(validate_icon(&PageIcon::Asset(Uuid::now_v7())).is_err());
    }
}
