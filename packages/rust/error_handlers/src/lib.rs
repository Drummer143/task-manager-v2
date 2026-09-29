//! Shared API error type: stable codes and typed params on the wire, no human-readable messages.
//!
//! - [`ErrorCode`] is the single source of truth for every error the API can return.
//! - [`ApiError`] is what handlers return through `?`; it may carry a private `source` for logs.
//! - [`ErrorBody`] is the public JSON shape (RFC 9457 `application/problem+json` without
//!   `title`/`detail`, since texts are localized on the client from `code` + `params`).

mod body;
mod code;
mod error;

#[cfg(feature = "sqlx")]
mod convert;
#[cfg(feature = "axum")]
pub mod extract;
#[cfg(feature = "axum")]
pub mod fallback;
#[cfg(feature = "axum")]
pub mod guard;
#[cfg(feature = "openapi")]
pub mod openapi;
#[cfg(feature = "axum")]
mod response;
#[cfg(feature = "axum")]
pub mod trace;

pub use body::{ErrorBody, FieldError};
pub use code::ErrorCode;
pub use error::ApiError;

pub type Result<T> = std::result::Result<T, ApiError>;
