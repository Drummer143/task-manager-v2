//! The permission to upload the file of one asset. Main issues it with the pending asset; storage
//! checks it when the upload starts and hands it back when the upload is done, so main knows
//! which asset the blob is for and that this user was allowed to upload it.

use std::sync::Arc;

use error_handlers::{ApiError, ErrorCode};
use jsonwebtoken::{Algorithm, DecodingKey, EncodingKey, Header, Validation};
use serde::{Deserialize, Serialize};
use uuid::Uuid;

/// As long as a pending asset lives: the cleanup removes it after a day, and an upload of a big
/// file on a slow connection must not outlive its token.
pub const UPLOAD_TOKEN_TTL_SECS: u64 = 24 * 60 * 60;

/// Storage reads `user_id` and `name` (`storage::entities::actions::dto::UploadToken`).
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct UploadClaims {
    /// The asset the file is for.
    pub sub: Uuid,
    /// Who may upload it: storage refuses the token to anyone else.
    pub user_id: Uuid,
    /// The file name storage keeps with the upload.
    pub name: String,
    pub exp: u64,
}

/// The HS256 secret shared with storage (`JWT_SECRET` of both).
#[derive(Clone)]
pub struct UploadTokenKey(Arc<str>);

impl UploadTokenKey {
    pub fn new(secret: impl Into<Arc<str>>) -> Self {
        Self(secret.into())
    }

    pub fn issue(&self, asset_id: Uuid, user_id: Uuid, name: &str) -> Result<String, ApiError> {
        let claims = UploadClaims {
            sub: asset_id,
            user_id,
            name: name.to_owned(),
            exp: jsonwebtoken::get_current_timestamp() + UPLOAD_TOKEN_TTL_SECS,
        };

        jsonwebtoken::encode(
            &Header::new(Algorithm::HS256),
            &claims,
            &EncodingKey::from_secret(self.0.as_bytes()),
        )
        .map_err(ApiError::internal)
    }

    /// `UPLOAD_TOKEN_INVALID` for a token that is malformed, signed with another key or expired.
    pub fn verify(&self, token: &str) -> Result<UploadClaims, ApiError> {
        jsonwebtoken::decode::<UploadClaims>(
            token,
            &DecodingKey::from_secret(self.0.as_bytes()),
            &Validation::new(Algorithm::HS256),
        )
        .map(|data| data.claims)
        .map_err(|e| ApiError::new(ErrorCode::UploadTokenInvalid).with_source(e))
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn reads_back_what_it_issues() {
        let key = UploadTokenKey::new("secret");
        let (asset, user) = (Uuid::now_v7(), Uuid::now_v7());

        let claims = key
            .verify(&key.issue(asset, user, "icon.png").unwrap())
            .unwrap();

        assert_eq!(
            (claims.sub, claims.user_id, claims.name.as_str()),
            (asset, user, "icon.png")
        );
        assert!(claims.exp > jsonwebtoken::get_current_timestamp());
    }

    #[test]
    fn refuses_a_token_signed_with_another_key() {
        let token = UploadTokenKey::new("other")
            .issue(Uuid::now_v7(), Uuid::now_v7(), "icon.png")
            .unwrap();

        let error = UploadTokenKey::new("secret").verify(&token).unwrap_err();

        assert_eq!(error.code(), &ErrorCode::UploadTokenInvalid);
    }

    #[test]
    fn refuses_an_expired_token() {
        let key = UploadTokenKey::new("secret");
        let claims = UploadClaims {
            sub: Uuid::now_v7(),
            user_id: Uuid::now_v7(),
            name: "icon.png".into(),
            exp: jsonwebtoken::get_current_timestamp() - 3600,
        };
        let token = jsonwebtoken::encode(
            &Header::new(Algorithm::HS256),
            &claims,
            &EncodingKey::from_secret(b"secret"),
        )
        .unwrap();

        assert_eq!(
            key.verify(&token).unwrap_err().code(),
            &ErrorCode::UploadTokenInvalid
        );
    }
}
