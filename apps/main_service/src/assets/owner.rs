//! What each owner type allows: who may attach a file to it, what file, and who may read it.
//! Reading an asset is reading its owner (backend spec §4.4); a new owner type adds its arm here.

use error_handlers::ApiError;
use sql_models::asset::model::{AssetOwnerType, AssetVisibility};
use uuid::Uuid;

use crate::workspaces_mocks;

/// What the client asks to attach a file to.
#[derive(Debug, Clone, Copy)]
pub struct Owner {
    pub kind: AssetOwnerType,
    pub id: Uuid,
}

impl Owner {
    /// The workspace whose data the asset is; `None` for an account-level one.
    pub fn workspace_id(&self) -> Option<Uuid> {
        match self.kind {
            AssetOwnerType::WorkspaceIcon => Some(self.id),
        }
    }

    pub fn visibility(&self) -> AssetVisibility {
        match self.kind {
            // Shown on `/join` to people who are not members yet; the id is unguessable and an
            // icon is no secret
            AssetOwnerType::WorkspaceIcon => AssetVisibility::Public,
        }
    }

    /// The largest file, in bytes.
    pub fn max_size(&self) -> u64 {
        match self.kind {
            // Workspace settings §03: PNG, JPG, SVG up to 2 MB
            AssetOwnerType::WorkspaceIcon => 2 * 1024 * 1024,
        }
    }

    /// Whether a file of this type may belong to the owner. Storage detects the type from the
    /// content, so this is checked when the upload completes.
    pub fn accepts(&self, mime_type: &str) -> bool {
        match self.kind {
            AssetOwnerType::WorkspaceIcon => {
                matches!(mime_type, "image/png" | "image/jpeg" | "image/svg+xml")
            }
        }
    }

    /// Fails unless `user_id` may attach a file to the owner.
    pub async fn ensure_can_attach(
        &self,
        pool: &sqlx::PgPool,
        user_id: Uuid,
    ) -> Result<(), ApiError> {
        match self.kind {
            AssetOwnerType::WorkspaceIcon => {
                workspaces_mocks::ensure_can_change_settings(pool, user_id, self.id).await
            }
        }
    }

    /// Whether `user_id` may read a private asset of the owner.
    pub async fn can_read(&self, pool: &sqlx::PgPool, user_id: Uuid) -> Result<bool, ApiError> {
        match self.kind {
            AssetOwnerType::WorkspaceIcon => {
                match workspaces_mocks::ensure_member(pool, user_id, self.id).await {
                    Ok(()) => Ok(true),
                    Err(e) if e.status() == 404 => Ok(false),
                    Err(e) => Err(e),
                }
            }
        }
    }
}
