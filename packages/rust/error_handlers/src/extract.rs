//! Drop-in replacements for axum's `Json`, `Query` and `Path` whose rejections are [`ApiError`]s,
//! so malformed requests get the same `application/problem+json` body as every other error.

use axum::{
    extract::{
        FromRequest, FromRequestParts, Path, Query, Request,
        rejection::{JsonRejection, PathRejection, QueryRejection},
    },
    http::{StatusCode, request::Parts},
    response::{IntoResponse, Response},
};
use serde::{Serialize, de::DeserializeOwned};

use crate::{ApiError, ErrorCode};

/// Maps an axum rejection to a code by its status. The rejection text is kept as `source` only:
/// it can echo user input, so it never reaches the response.
fn from_rejection<R>(status: StatusCode, rejection: R) -> ApiError
where
    R: std::error::Error + Send + Sync + 'static,
{
    let code = match status {
        StatusCode::BAD_REQUEST | StatusCode::UNPROCESSABLE_ENTITY => ErrorCode::MalformedRequest,
        StatusCode::PAYLOAD_TOO_LARGE => ErrorCode::PayloadTooLarge,
        StatusCode::UNSUPPORTED_MEDIA_TYPE => ErrorCode::UnsupportedMediaType,
        // Anything else (e.g. a missing path extractor) is a server-side mistake.
        _ => ErrorCode::Internal,
    };
    ApiError::new(code).with_source(rejection)
}

impl From<JsonRejection> for ApiError {
    fn from(rejection: JsonRejection) -> Self {
        from_rejection(rejection.status(), rejection)
    }
}

impl From<QueryRejection> for ApiError {
    fn from(rejection: QueryRejection) -> Self {
        from_rejection(rejection.status(), rejection)
    }
}

impl From<PathRejection> for ApiError {
    fn from(rejection: PathRejection) -> Self {
        from_rejection(rejection.status(), rejection)
    }
}

/// [`axum::Json`] with [`ApiError`] rejections. Also usable as a response body.
#[derive(Debug, Clone, Copy, Default)]
pub struct ApiJson<T>(pub T);

impl<S, T> FromRequest<S> for ApiJson<T>
where
    S: Send + Sync,
    T: DeserializeOwned,
{
    type Rejection = ApiError;

    async fn from_request(req: Request, state: &S) -> Result<Self, Self::Rejection> {
        let axum::Json(value) = axum::Json::<T>::from_request(req, state).await?;
        Ok(Self(value))
    }
}

impl<T: Serialize> IntoResponse for ApiJson<T> {
    fn into_response(self) -> Response {
        axum::Json(self.0).into_response()
    }
}

/// [`axum::extract::Query`] with [`ApiError`] rejections.
#[derive(Debug, Clone, Copy, Default)]
pub struct ApiQuery<T>(pub T);

impl<S, T> FromRequestParts<S> for ApiQuery<T>
where
    S: Send + Sync,
    T: DeserializeOwned,
{
    type Rejection = ApiError;

    async fn from_request_parts(parts: &mut Parts, state: &S) -> Result<Self, Self::Rejection> {
        let Query(value) = Query::<T>::from_request_parts(parts, state).await?;
        Ok(Self(value))
    }
}

/// [`axum::extract::Path`] with [`ApiError`] rejections.
#[derive(Debug, Clone, Copy, Default)]
pub struct ApiPath<T>(pub T);

impl<S, T> FromRequestParts<S> for ApiPath<T>
where
    S: Send + Sync,
    T: DeserializeOwned + Send,
{
    type Rejection = ApiError;

    async fn from_request_parts(parts: &mut Parts, state: &S) -> Result<Self, Self::Rejection> {
        let Path(value) = Path::<T>::from_request_parts(parts, state).await?;
        Ok(Self(value))
    }
}
