//! Signed file links.
//!
//! A private file is fetched through `/files/{asset_id}?sig=<token>`. The token is a short-lived
//! HS256 JWT minted by this service after the main service confirmed that the user may read the
//! asset. Verifying it needs no call to the main service, so media players and `<img>` tags can
//! fetch (and Range-request) files without custom headers.
//!
//! The secret never leaves storage: only storage mints and verifies these tokens.

use std::time::{SystemTime, UNIX_EPOCH};

use error_handlers::{ApiError, ErrorCode};
use jsonwebtoken::{
    Algorithm, DecodingKey, EncodingKey, Header, Validation, decode, encode, errors::ErrorKind,
};
use serde::{Deserialize, Serialize};
use uuid::Uuid;

/// Shorter secrets are rejected at startup.
pub const MIN_SECRET_LEN: usize = 32;

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct FileLinkClaims {
    /// The asset the link was issued for; it must match the asset in the URL path.
    pub asset: Uuid,
    /// The stored content to serve.
    pub blob: Uuid,
    /// File name offered on download.
    pub name: String,
    /// Expiry, seconds since the Unix epoch.
    pub exp: u64,
}

pub fn now_secs() -> u64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default()
        .as_secs()
}

pub fn sign(secret: &str, claims: &FileLinkClaims) -> Result<String, ApiError> {
    encode(
        &Header::new(Algorithm::HS256),
        claims,
        &EncodingKey::from_secret(secret.as_bytes()),
    )
    .map_err(ApiError::internal)
}

/// Checks signature and expiry, and that the token was issued for `asset`.
///
/// Expired links get their own code so clients know to ask for a fresh one.
pub fn verify(secret: &str, token: &str, asset: Uuid) -> Result<FileLinkClaims, ApiError> {
    let mut validation = Validation::new(Algorithm::HS256);
    validation.leeway = 0;
    validation.set_required_spec_claims(&["exp"]);

    match decode::<FileLinkClaims>(token, &DecodingKey::from_secret(secret.as_bytes()), &validation)
    {
        Ok(data) if data.claims.asset == asset => Ok(data.claims),
        Ok(_) => Err(ApiError::new(ErrorCode::FileLinkInvalid).with_source("link is for another asset")),
        Err(error) if matches!(error.kind(), ErrorKind::ExpiredSignature) => {
            Err(ApiError::new(ErrorCode::FileLinkExpired))
        }
        Err(error) => Err(ApiError::new(ErrorCode::FileLinkInvalid).with_source(error)),
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    const SECRET: &str = "0123456789abcdef0123456789abcdef";

    fn claims(exp: u64) -> FileLinkClaims {
        FileLinkClaims {
            asset: Uuid::now_v7(),
            blob: Uuid::now_v7(),
            name: "cat.png".into(),
            exp,
        }
    }

    #[test]
    fn a_fresh_link_round_trips() {
        let claims = claims(now_secs() + 60);
        let token = sign(SECRET, &claims).unwrap();

        assert_eq!(verify(SECRET, &token, claims.asset).unwrap(), claims);
    }

    #[test]
    fn an_expired_link_is_reported_as_expired() {
        let claims = claims(now_secs() - 1);
        let token = sign(SECRET, &claims).unwrap();

        let error = verify(SECRET, &token, claims.asset).unwrap_err();

        assert_eq!(error.code(), &ErrorCode::FileLinkExpired);
    }

    #[test]
    fn a_link_signed_with_another_secret_is_invalid() {
        let claims = claims(now_secs() + 60);
        let token = sign("another-secret-another-secret-123", &claims).unwrap();

        let error = verify(SECRET, &token, claims.asset).unwrap_err();

        assert_eq!(error.code(), &ErrorCode::FileLinkInvalid);
    }

    #[test]
    fn a_link_cannot_be_reused_for_another_asset() {
        let claims = claims(now_secs() + 60);
        let token = sign(SECRET, &claims).unwrap();

        let error = verify(SECRET, &token, Uuid::now_v7()).unwrap_err();

        assert_eq!(error.code(), &ErrorCode::FileLinkInvalid);
    }

    #[test]
    fn garbage_and_tampered_tokens_are_invalid() {
        let claims = claims(now_secs() + 60);
        let token = sign(SECRET, &claims).unwrap();
        let mut tampered = token.clone();
        tampered.push('x');

        for bad in ["", "not-a-token", "a.b.c", tampered.as_str()] {
            let error = verify(SECRET, bad, claims.asset).unwrap_err();
            assert_eq!(error.code(), &ErrorCode::FileLinkInvalid, "{bad}");
        }
    }

    #[test]
    fn a_token_without_expiry_is_rejected() {
        #[derive(Serialize)]
        struct NoExp {
            asset: Uuid,
            blob: Uuid,
            name: String,
        }
        let asset = Uuid::now_v7();
        let token = encode(
            &Header::new(Algorithm::HS256),
            &NoExp {
                asset,
                blob: Uuid::now_v7(),
                name: "x".into(),
            },
            &EncodingKey::from_secret(SECRET.as_bytes()),
        )
        .unwrap();

        assert!(verify(SECRET, &token, asset).is_err());
    }
}
