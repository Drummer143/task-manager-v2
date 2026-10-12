use axum::{Json, extract::State};
use error_handlers::{ApiError, extract::ApiJson};
use sql_models::asset::model::AssetVisibility as StoredVisibility;
use utils::types::asset_access::{
    AssetAccess, AssetAccessRequest, AssetAccessResponse, AssetVisibility,
};

use crate::assets::{owner::Owner, repo::AssetsRepository};

/// `POST /internal/assets/access`: which of the assets may the user (or an anonymous visitor)
/// read. Unknown, unfinished and forbidden ones are all left out, so the answer never tells that
/// a forbidden asset exists.
pub async fn readable_assets(
    State(pool): State<sqlx::PgPool>,
    ApiJson(body): ApiJson<AssetAccessRequest>,
) -> Result<Json<AssetAccessResponse>, ApiError> {
    let assets = AssetsRepository::get_ready(&pool, &body.asset_ids).await?;

    let mut readable = Vec::with_capacity(assets.len());
    for asset in assets {
        let allowed = match (asset.visibility, body.user_id) {
            (StoredVisibility::Public, _) => true,
            (StoredVisibility::Private, None) => false,
            (StoredVisibility::Private, Some(user_id)) => {
                let owner = Owner {
                    kind: asset.owner_type,
                    id: asset.owner_id,
                };
                owner.can_read(&pool, user_id).await?
            }
        };

        // A ready asset always has its blob (`CHECK` on the table)
        if let (true, Some(blob_id)) = (allowed, asset.blob_id) {
            readable.push(AssetAccess {
                id: asset.id,
                blob_id,
                name: asset.name,
                visibility: match asset.visibility {
                    StoredVisibility::Public => AssetVisibility::Public,
                    StoredVisibility::Private => AssetVisibility::Private,
                },
            });
        }
    }

    Ok(Json(AssetAccessResponse { assets: readable }))
}
