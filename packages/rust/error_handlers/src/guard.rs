//! Turns panics and timeouts into [`ApiError`] responses instead of dropped connections or empty
//! bodies.
//!
//! ```ignore
//! let app = Router::new().route("/users", get(list_users));
//! let app = guard::request_timeout(guard::catch_panics(app), Duration::from_secs(30))
//!     .fallback(fallback::not_found)
//!     // Outermost, so the guards' errors also carry the request id.
//!     .layer(from_fn(trace::request_id));
//! ```

use std::{any::Any, time::Duration};

use axum::{
    BoxError, Router,
    error_handling::HandleErrorLayer,
    response::{IntoResponse, Response},
};
use tower::{ServiceBuilder, timeout::error::Elapsed};
use tower_http::catch_panic::CatchPanicLayer;

use crate::{ApiError, ErrorCode};

/// Best-effort text of a panic payload; it is only logged, never sent to the client.
fn panic_message(payload: &(dyn Any + Send)) -> String {
    let text = payload
        .downcast_ref::<&str>()
        .copied()
        .or_else(|| payload.downcast_ref::<String>().map(String::as_str))
        .unwrap_or("non-string payload");
    format!("handler panicked: {text}")
}

fn panic_response(payload: Box<dyn Any + Send + 'static>) -> Response {
    ApiError::internal(panic_message(payload.as_ref())).into_response()
}

async fn timeout_error(err: BoxError) -> ApiError {
    if err.is::<Elapsed>() {
        ApiError::new(ErrorCode::Timeout)
    } else {
        ApiError::internal(err)
    }
}

/// Answers a panicking handler with `500 INTERNAL` (the panic text goes to the log only).
///
/// Wraps everything registered so far, so call it after the routes.
pub fn catch_panics<S>(router: Router<S>) -> Router<S>
where
    S: Clone + Send + Sync + 'static,
{
    router.layer(CatchPanicLayer::custom(panic_response))
}

/// Answers with `504 TIMEOUT` when a request takes longer than `timeout`, dropping the handler.
///
/// Wraps everything registered so far, so call it after the routes.
pub fn request_timeout<S>(router: Router<S>, timeout: Duration) -> Router<S>
where
    S: Clone + Send + Sync + 'static,
{
    router.layer(
        ServiceBuilder::new()
            .layer(HandleErrorLayer::new(timeout_error))
            .timeout(timeout),
    )
}
