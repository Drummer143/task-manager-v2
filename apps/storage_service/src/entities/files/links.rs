//! Batched link issuance.
//!
//! A rich-text editor can show hundreds of files at once, so links are requested in bulk:
//! one request from the client, one `readable_assets` call to the main service.
//!
//! - **public** assets get a stable link (`/public/files/{asset_id}`) that needs no signature,
//!   so published pages can embed it and caches can keep it;
//! - **private** assets get a signed, expiring link.
//!
//! Assets the caller cannot read are reported as `unavailable`, whether they are forbidden or do
//! not exist, so the answer reveals nothing about assets the caller has no access to.

use std::{collections::HashSet, time::Duration};

use error_handlers::{ApiError, ErrorCode};
use serde::{Deserialize, Serialize};
use utils::types::asset_access::{AssetAccess, AssetVisibility};
use uuid::Uuid;

use super::signing::{self, FileLinkClaims, MIN_SECRET_LEN};

/// More ids than this in one request are rejected with `TOO_MANY_ITEMS`.
pub const MAX_LINKS_PER_REQUEST: usize = 200;

/// Settings for issuing links; built once at startup.
#[derive(Clone)]
pub struct FileLinkConfig {
    secret: std::sync::Arc<String>,
    ttl: Duration,
    public_base_url: std::sync::Arc<str>,
}

impl FileLinkConfig {
    /// # Panics
    ///
    /// On a secret shorter than [`MIN_SECRET_LEN`] bytes or a zero `ttl`: a weak signing secret
    /// makes links forgeable, so a misconfigured service must fail at startup.
    pub fn new(secret: &str, ttl: Duration, public_base_url: &str) -> Self {
        assert!(
            secret.len() >= MIN_SECRET_LEN,
            "FILE_LINK_SECRET must be at least {MIN_SECRET_LEN} bytes long"
        );
        assert!(!ttl.is_zero(), "the file link lifetime must not be zero");
        Self {
            secret: secret.to_owned().into(),
            ttl,
            public_base_url: public_base_url.trim_end_matches('/').into(),
        }
    }

    pub fn secret(&self) -> &str {
        &self.secret
    }

    fn public_url(&self, asset_id: Uuid) -> String {
        format!("{}/public/files/{asset_id}", self.public_base_url)
    }

    fn signed_url(&self, asset_id: Uuid, token: &str) -> String {
        format!("{}/files/{asset_id}?sig={token}", self.public_base_url)
    }
}

#[derive(Debug, Deserialize, utoipa::ToSchema)]
#[serde(rename_all = "camelCase")]
pub struct FileLinksRequest {
    /// Assets to get links for. At most 200 per request.
    pub asset_ids: Vec<Uuid>,
}

#[derive(Debug, Serialize, utoipa::ToSchema)]
#[serde(rename_all = "camelCase")]
pub struct FileLink {
    pub asset_id: Uuid,
    /// Absolute URL to fetch the file from; usable as `<img src>` or `<video src>`.
    pub url: String,
    pub visibility: AssetVisibility,
    /// Seconds since the Unix epoch. `null` for public links, which do not expire.
    pub expires_at: Option<u64>,
}

#[derive(Debug, Serialize, utoipa::ToSchema)]
#[serde(rename_all = "camelCase")]
pub struct FileLinksResponse {
    pub links: Vec<FileLink>,
    /// Requested assets the caller may not read, or that do not exist.
    pub unavailable: Vec<Uuid>,
}

/// Validates the request and returns the distinct ids to look up.
pub fn requested_ids(request: &FileLinksRequest) -> Result<Vec<Uuid>, ApiError> {
    if request.asset_ids.len() > MAX_LINKS_PER_REQUEST {
        return Err(ApiError::new(ErrorCode::TooManyItems {
            max_items: MAX_LINKS_PER_REQUEST as u64,
        }));
    }

    let mut seen = HashSet::new();
    Ok(request
        .asset_ids
        .iter()
        .copied()
        .filter(|id| seen.insert(*id))
        .collect())
}

/// Turns the main service's answer into links. `now` is passed in to keep this pure.
pub fn build_links(
    config: &FileLinkConfig,
    requested: &[Uuid],
    readable: Vec<AssetAccess>,
    now: u64,
) -> Result<FileLinksResponse, ApiError> {
    let mut links = Vec::with_capacity(readable.len());
    let mut answered = HashSet::new();

    for asset in readable {
        // The main service must only answer what was asked; ignore anything else.
        if !requested.contains(&asset.id) || !answered.insert(asset.id) {
            continue;
        }

        let link = match asset.visibility {
            AssetVisibility::Public => FileLink {
                asset_id: asset.id,
                url: config.public_url(asset.id),
                visibility: AssetVisibility::Public,
                expires_at: None,
            },
            AssetVisibility::Private => {
                let exp = now + config.ttl.as_secs();
                let token = signing::sign(
                    config.secret(),
                    &FileLinkClaims {
                        asset: asset.id,
                        blob: asset.blob_id,
                        name: asset.name,
                        exp,
                    },
                )?;
                FileLink {
                    asset_id: asset.id,
                    url: config.signed_url(asset.id, &token),
                    visibility: AssetVisibility::Private,
                    expires_at: Some(exp),
                }
            }
        };
        links.push(link);
    }

    let unavailable = requested
        .iter()
        .copied()
        .filter(|id| !answered.contains(id))
        .collect();

    Ok(FileLinksResponse { links, unavailable })
}

#[cfg(test)]
mod tests {
    use super::*;

    const SECRET: &str = "0123456789abcdef0123456789abcdef";

    fn config() -> FileLinkConfig {
        FileLinkConfig::new(SECRET, Duration::from_secs(3600), "https://example.test/storage/")
    }

    fn asset(visibility: AssetVisibility) -> AssetAccess {
        AssetAccess {
            id: Uuid::new_v4(),
            blob_id: Uuid::new_v4(),
            name: "report.pdf".into(),
            visibility,
        }
    }

    #[test]
    fn public_assets_get_a_stable_unsigned_link() {
        let public = asset(AssetVisibility::Public);

        let response = build_links(&config(), &[public.id], vec![public.clone()], 1_000).unwrap();

        let link = &response.links[0];
        assert_eq!(
            link.url,
            format!("https://example.test/storage/public/files/{}", public.id)
        );
        assert_eq!(link.expires_at, None);
        assert!(response.unavailable.is_empty());
    }

    #[test]
    fn private_assets_get_a_signed_link_that_verifies() {
        let private = asset(AssetVisibility::Private);

        let response = build_links(&config(), &[private.id], vec![private.clone()], 1_000).unwrap();

        let link = &response.links[0];
        assert_eq!(link.expires_at, Some(4_600));
        let token = link.url.split("?sig=").nth(1).expect("signed link has ?sig=");
        let claims = jsonwebtoken_claims(token, private.id);
        assert_eq!(claims.blob, private.blob_id);
        assert_eq!(claims.name, "report.pdf");
        assert_eq!(claims.exp, 4_600);
    }

    /// Decodes without checking expiry: the test clock is not the real one.
    fn jsonwebtoken_claims(token: &str, asset: Uuid) -> FileLinkClaims {
        let mut validation = jsonwebtoken::Validation::new(jsonwebtoken::Algorithm::HS256);
        validation.validate_exp = false;
        let data = jsonwebtoken::decode::<FileLinkClaims>(
            token,
            &jsonwebtoken::DecodingKey::from_secret(SECRET.as_bytes()),
            &validation,
        )
        .unwrap();
        assert_eq!(data.claims.asset, asset);
        data.claims
    }

    #[test]
    fn assets_missing_from_the_answer_are_unavailable() {
        let readable = asset(AssetVisibility::Private);
        let hidden = Uuid::new_v4();
        let requested = [readable.id, hidden];

        let response = build_links(&config(), &requested, vec![readable.clone()], 0).unwrap();

        assert_eq!(response.links.len(), 1);
        assert_eq!(response.unavailable, vec![hidden]);
    }

    #[test]
    fn assets_that_were_not_requested_are_ignored() {
        let asked = asset(AssetVisibility::Public);
        let extra = asset(AssetVisibility::Public);

        let response =
            build_links(&config(), &[asked.id], vec![asked.clone(), extra], 0).unwrap();

        assert_eq!(response.links.len(), 1);
        assert_eq!(response.links[0].asset_id, asked.id);
    }

    #[test]
    fn a_duplicated_answer_yields_one_link() {
        let public = asset(AssetVisibility::Public);

        let response = build_links(
            &config(),
            &[public.id],
            vec![public.clone(), public.clone()],
            0,
        )
        .unwrap();

        assert_eq!(response.links.len(), 1);
    }

    #[test]
    fn requested_ids_are_deduplicated_keeping_order() {
        let (a, b) = (Uuid::new_v4(), Uuid::new_v4());
        let request = FileLinksRequest {
            asset_ids: vec![a, b, a, b, a],
        };

        assert_eq!(requested_ids(&request).unwrap(), vec![a, b]);
    }

    #[test]
    fn too_many_ids_are_rejected_before_any_lookup() {
        let request = FileLinksRequest {
            asset_ids: (0..=MAX_LINKS_PER_REQUEST).map(|_| Uuid::new_v4()).collect(),
        };

        let error = requested_ids(&request).unwrap_err();

        assert_eq!(
            error.code(),
            &ErrorCode::TooManyItems {
                max_items: MAX_LINKS_PER_REQUEST as u64
            }
        );
    }

    #[test]
    fn exactly_the_limit_is_fine() {
        let request = FileLinksRequest {
            asset_ids: (0..MAX_LINKS_PER_REQUEST).map(|_| Uuid::new_v4()).collect(),
        };

        assert_eq!(requested_ids(&request).unwrap().len(), MAX_LINKS_PER_REQUEST);
    }

    #[test]
    #[should_panic(expected = "at least")]
    fn a_short_secret_is_rejected_at_startup() {
        FileLinkConfig::new("too-short", Duration::from_secs(60), "https://x.test");
    }
}
