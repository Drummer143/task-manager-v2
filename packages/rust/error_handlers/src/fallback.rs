//! Router-level fallbacks, so unknown routes and wrong methods also answer with [`ApiError`].
//!
//! ```ignore
//! let app = Router::new()
//!     .route("/users", get(list_users))
//!     .fallback(error_handlers::fallback::not_found)
//!     .method_not_allowed_fallback(error_handlers::fallback::method_not_allowed);
//! ```

use crate::{ApiError, ErrorCode};

/// `404 NOT_FOUND` for paths no route matches.
pub async fn not_found() -> ApiError {
    ApiError::new(ErrorCode::NotFound)
}

/// `405 METHOD_NOT_ALLOWED` for known paths called with the wrong method.
pub async fn method_not_allowed() -> ApiError {
    ApiError::new(ErrorCode::MethodNotAllowed)
}
