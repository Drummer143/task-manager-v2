use std::{error::Error, fmt};

use crate::{ErrorBody, ErrorCode, FieldError};

type BoxError = Box<dyn Error + Send + Sync>;

/// The error handlers return. Never serialized directly: use [`ApiError::to_body`].
///
/// `source` is for logs only and never reaches the response.
#[derive(Debug)]
pub struct ApiError {
    code: ErrorCode,
    field_errors: Vec<FieldError>,
    trace_id: Option<String>,
    source: Option<BoxError>,
}

impl ApiError {
    pub fn new(code: ErrorCode) -> Self {
        Self {
            code,
            field_errors: Vec::new(),
            trace_id: None,
            source: None,
        }
    }

    /// Shortcut for [`ErrorCode::ValidationFailed`] with per-field errors.
    pub fn validation(field_errors: Vec<FieldError>) -> Self {
        Self::new(ErrorCode::ValidationFailed).with_field_errors(field_errors)
    }

    /// Shortcut for [`ErrorCode::Internal`] keeping the cause for logs.
    pub fn internal(source: impl Into<BoxError>) -> Self {
        Self::new(ErrorCode::Internal).with_source(source)
    }

    pub fn with_source(mut self, source: impl Into<BoxError>) -> Self {
        self.source = Some(source.into());
        self
    }

    pub fn with_field_errors(mut self, field_errors: Vec<FieldError>) -> Self {
        self.field_errors = field_errors;
        self
    }

    pub fn with_trace_id(mut self, trace_id: impl Into<String>) -> Self {
        self.trace_id = Some(trace_id.into());
        self
    }

    pub fn code(&self) -> &ErrorCode {
        &self.code
    }

    pub fn status(&self) -> u16 {
        self.code.status()
    }

    /// Builds the public body. `source` is intentionally not part of it.
    pub fn to_body(&self) -> ErrorBody {
        ErrorBody {
            problem_type: self.code.problem_type(),
            status: self.code.status(),
            code: self.code.clone(),
            errors: self.field_errors.clone(),
            trace_id: self.trace_id.clone(),
        }
    }
}

impl From<ErrorCode> for ApiError {
    fn from(code: ErrorCode) -> Self {
        Self::new(code)
    }
}

/// Rebuilds an error received from another service that speaks the same contract, so it can be
/// passed on to the caller. The upstream `trace_id` belongs to that service's logs: it is kept as
/// `source` for correlation, and this request's own id is used in the response.
impl From<ErrorBody> for ApiError {
    fn from(body: ErrorBody) -> Self {
        let upstream = body
            .trace_id
            .map(|id| format!("upstream {} (trace_id {id})", body.code.as_str()));
        let error = Self::new(body.code).with_field_errors(body.errors);
        match upstream {
            Some(upstream) => error.with_source(upstream),
            None => error,
        }
    }
}

impl fmt::Display for ApiError {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        write!(f, "{} ({})", self.code.as_str(), self.code.status())
    }
}

impl Error for ApiError {
    fn source(&self) -> Option<&(dyn Error + 'static)> {
        self.source.as_deref().map(|e| e as &(dyn Error + 'static))
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn upstream_body_becomes_an_error_with_its_own_trace_id_dropped() {
        let upstream: ErrorBody = serde_json::from_str(
            r#"{"type":"urn:task-manager:error:file-too-large","status":413,
                "code":"FILE_TOO_LARGE","params":{"max_bytes":5,"actual_bytes":9},
                "trace_id":"upstream-id"}"#,
        )
        .unwrap();

        let error = ApiError::from(upstream);

        assert_eq!(
            error.code(),
            &ErrorCode::FileTooLarge {
                max_bytes: 5,
                actual_bytes: 9
            }
        );
        assert_eq!(error.to_body().trace_id, None);
        let source = Error::source(&error).unwrap().to_string();
        assert!(source.contains("upstream-id"), "{source}");
    }

    #[test]
    fn upstream_field_errors_are_kept() {
        let upstream: ErrorBody = serde_json::from_str(
            r#"{"type":"t","status":422,"code":"VALIDATION_FAILED",
                "errors":[{"field":"name","code":"REQUIRED"}]}"#,
        )
        .unwrap();

        let body = ApiError::from(upstream).to_body();

        assert_eq!(body.errors, [FieldError::new("name", ErrorCode::Required)]);
    }

    #[test]
    fn an_unknown_upstream_code_does_not_deserialize() {
        let result =
            serde_json::from_str::<ErrorBody>(r#"{"type":"t","status":418,"code":"BREWING_TEA"}"#);
        assert!(result.is_err());
    }
}
