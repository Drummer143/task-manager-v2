//! Request id middleware: every response carries `X-Request-Id`, and every error body carries the
//! same value as `trace_id`, so a reported problem can be found in the logs.
//!
//! ```ignore
//! let app = Router::new()
//!     .route("/users", get(list_users))
//!     .fallback(error_handlers::fallback::not_found)
//!     // Must come after `.fallback(..)`: `Router::layer` only wraps what is already registered.
//!     .layer(axum::middleware::from_fn(error_handlers::trace::request_id));
//! ```
//!
//! The id lives in a task-local for the duration of the request, which is how
//! `ApiError::into_response` (it never sees the request) finds it.

use axum::{
    extract::Request,
    http::{HeaderName, HeaderValue},
    middleware::Next,
    response::Response,
};
use tracing::Instrument;

/// Header used to accept an id from the caller and to return it.
pub const REQUEST_ID_HEADER: HeaderName = HeaderName::from_static("x-request-id");

const MAX_LEN: usize = 64;

tokio::task_local! {
    static TRACE_ID: String;
}

/// The id of the request being handled, if running inside [`request_id`].
pub fn current_trace_id() -> Option<String> {
    TRACE_ID.try_with(Clone::clone).ok()
}

/// Accepts a caller-supplied id only if it is short and made of harmless characters; anything else
/// could forge or break log lines.
fn is_acceptable(id: &str) -> bool {
    !id.is_empty()
        && id.len() <= MAX_LEN
        && id
            .bytes()
            .all(|b| b.is_ascii_alphanumeric() || matches!(b, b'-' | b'_' | b'.'))
}

/// Middleware for `axum::middleware::from_fn`: picks or generates the request id, exposes it to
/// error responses and logs, and echoes it in the `X-Request-Id` response header.
pub async fn request_id(mut req: Request, next: Next) -> Response {
    let id = req
        .headers()
        .get(&REQUEST_ID_HEADER)
        .and_then(|value| value.to_str().ok())
        .filter(|id| is_acceptable(id))
        .map(str::to_owned)
        .unwrap_or_else(|| uuid::Uuid::new_v4().to_string());

    // Only ever built from validated or generated ids, so this cannot fail.
    let header_value = HeaderValue::from_str(&id).expect("request id is a valid header value");
    // Make the id visible to the handler (e.g. when it calls another service).
    req.headers_mut()
        .insert(REQUEST_ID_HEADER, header_value.clone());

    let span = tracing::info_span!(
        "request",
        request_id = %id,
        method = %req.method(),
        path = %req.uri().path(),
    );

    let mut response = TRACE_ID.scope(id, next.run(req).instrument(span)).await;
    response
        .headers_mut()
        .insert(REQUEST_ID_HEADER, header_value);
    response
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn accepts_plain_ids_only() {
        assert!(is_acceptable("abc-123_DEF.4"));
        assert!(is_acceptable(&"a".repeat(MAX_LEN)));

        assert!(!is_acceptable(""));
        assert!(!is_acceptable(&"a".repeat(MAX_LEN + 1)));
        assert!(!is_acceptable("has space"));
        assert!(!is_acceptable("line\nbreak"));
        assert!(!is_acceptable("semi;colon"));
    }

    #[test]
    fn no_trace_id_outside_middleware() {
        assert_eq!(current_trace_id(), None);
    }
}
