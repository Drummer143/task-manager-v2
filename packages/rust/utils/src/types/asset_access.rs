//! Contract of `POST /internal/assets/access`, implemented by `main_service` and called by
//! `storage`.
//!
//! Files are stored once per content (deduplicated), but every user has their own *asset*, and
//! assets carry the access rules. Storage therefore never decides who may read a file: it asks the
//! service that owns assets, in batches, and only gets back the assets the caller may read.

use serde::{Deserialize, Serialize};
use utoipa::ToSchema;
use uuid::Uuid;

/// Who may read an asset besides its owners.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, ToSchema)]
#[serde(rename_all = "lowercase")]
pub enum AssetVisibility {
    /// Anyone with the link, no sign-in needed (e.g. avatars, published pages).
    Public,
    /// Only users that have access to the asset.
    Private,
}

/// Which of these assets may `user_id` read?
#[derive(Debug, Clone, Serialize, Deserialize, ToSchema)]
#[serde(rename_all = "camelCase")]
pub struct AssetAccessRequest {
    /// The signed-in user, or `null` for an anonymous visitor (who may only read public assets).
    pub user_id: Option<Uuid>,
    pub asset_ids: Vec<Uuid>,
}

/// An asset the caller may read.
#[derive(Debug, Clone, Serialize, Deserialize, ToSchema)]
#[serde(rename_all = "camelCase")]
pub struct AssetAccess {
    pub id: Uuid,
    /// The stored content behind the asset.
    pub blob_id: Uuid,
    /// File name offered on download.
    pub name: String,
    pub visibility: AssetVisibility,
}

/// Only readable assets are listed. Unknown and forbidden assets are both left out, so the answer
/// never reveals that a forbidden asset exists.
#[derive(Debug, Clone, Serialize, Deserialize, ToSchema)]
#[serde(rename_all = "camelCase")]
pub struct AssetAccessResponse {
    pub assets: Vec<AssetAccess>,
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn wire_format_is_camel_case_with_lowercase_visibility() {
        let response: AssetAccessResponse = serde_json::from_str(
            r#"{"assets":[{"id":"6f1c2b8e-0000-4000-8000-000000000001",
                "blobId":"6f1c2b8e-0000-4000-8000-000000000002",
                "name":"cat.png","visibility":"public"}]}"#,
        )
        .unwrap();

        assert_eq!(response.assets[0].visibility, AssetVisibility::Public);

        let request = serde_json::to_value(AssetAccessRequest {
            user_id: None,
            asset_ids: vec![],
        })
        .unwrap();
        assert_eq!(request["userId"], serde_json::Value::Null);
        assert!(request["assetIds"].is_array());
    }
}
