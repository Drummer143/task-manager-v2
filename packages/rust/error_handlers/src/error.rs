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
