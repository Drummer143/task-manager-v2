use axum::{
    http::{HeaderValue, StatusCode, header},
    response::{IntoResponse, Response},
};

use crate::ApiError;

const PROBLEM_JSON: &str = "application/problem+json";

/// Used when the body itself cannot be serialized, so we never panic while reporting an error.
const FALLBACK_BODY: &str =
    r#"{"type":"urn:task-manager:error:internal","status":500,"code":"INTERNAL"}"#;

impl IntoResponse for ApiError {
    fn into_response(self) -> Response {
        let status =
            StatusCode::from_u16(self.status()).unwrap_or(StatusCode::INTERNAL_SERVER_ERROR);

        if status.is_server_error() {
            tracing::error!(
                code = self.code().as_str(),
                source = ?std::error::Error::source(&self),
                "request failed"
            );
        } else {
            tracing::debug!(code = self.code().as_str(), "request rejected");
        }

        // An id set explicitly on the error wins; otherwise use the one the middleware assigned.
        let mut body = self.to_body();
        if body.trace_id.is_none() {
            body.trace_id = crate::trace::current_trace_id();
        }

        let (status, body) = match serde_json::to_vec(&body) {
            Ok(body) => (status, body),
            Err(err) => {
                tracing::error!(?err, "failed to serialize error body");
                (
                    StatusCode::INTERNAL_SERVER_ERROR,
                    FALLBACK_BODY.as_bytes().to_vec(),
                )
            }
        };

        (
            status,
            [
                (header::CONTENT_TYPE, HeaderValue::from_static(PROBLEM_JSON)),
                (header::CACHE_CONTROL, HeaderValue::from_static("no-store")),
            ],
            body,
        )
            .into_response()
    }
}

#[cfg(test)]
mod tests {
    use axum::body::to_bytes;
    use serde_json::Value;

    use crate::{ErrorCode, FieldError};

    use super::*;

    async fn json_of(err: ApiError) -> (StatusCode, Value) {
        let response = err.into_response();
        let status = response.status();
        assert_eq!(response.headers()[header::CONTENT_TYPE], PROBLEM_JSON);
        let bytes = to_bytes(response.into_body(), usize::MAX).await.unwrap();
        (status, serde_json::from_slice(&bytes).unwrap())
    }

    #[tokio::test]
    async fn renders_code_params_and_status() {
        let (status, json) = json_of(
            ErrorCode::FileTooLarge {
                max_bytes: 5,
                actual_bytes: 9,
            }
            .into(),
        )
        .await;

        assert_eq!(status, StatusCode::PAYLOAD_TOO_LARGE);
        assert_eq!(json["status"], 413);
        assert_eq!(json["type"], "urn:task-manager:error:file-too-large");
        assert_eq!(json["code"], "FILE_TOO_LARGE");
        assert_eq!(json["params"]["max_bytes"], 5);
        assert!(json.get("errors").is_none());
    }

    #[tokio::test]
    async fn renders_field_errors() {
        let err = ApiError::validation(vec![FieldError::new("avatar", ErrorCode::Required)]);
        let (status, json) = json_of(err).await;

        assert_eq!(status, StatusCode::UNPROCESSABLE_ENTITY);
        assert_eq!(json["errors"][0]["field"], "avatar");
        assert_eq!(json["errors"][0]["code"], "REQUIRED");
    }

    #[tokio::test]
    async fn never_leaks_source_or_messages() {
        let (status, json) = json_of(ApiError::internal("connection refused by db")).await;

        assert_eq!(status, StatusCode::INTERNAL_SERVER_ERROR);
        assert!(!json.to_string().contains("refused"));
        for forbidden in ["message", "detail", "title"] {
            assert!(json.get(forbidden).is_none());
        }
    }
}
