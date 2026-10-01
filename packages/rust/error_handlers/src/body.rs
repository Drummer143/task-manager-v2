use serde::{Deserialize, Serialize};

use crate::ErrorCode;

/// Error attached to a single request field.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[cfg_attr(feature = "openapi", derive(utoipa::ToSchema))]
pub struct FieldError {
    /// Name of the offending field, e.g. `avatar`.
    pub field: String,
    #[serde(flatten)]
    pub code: ErrorCode,
}

impl FieldError {
    pub fn new(field: impl Into<String>, code: ErrorCode) -> Self {
        Self {
            field: field.into(),
            code,
        }
    }
}

/// Public JSON body of every error response (`application/problem+json`).
///
/// There is deliberately no message field: clients localize from `code` and `params`.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[cfg_attr(feature = "openapi", derive(utoipa::ToSchema))]
pub struct ErrorBody {
    /// Stable URI identifying the class of problem.
    #[serde(rename = "type")]
    pub problem_type: String,
    /// HTTP status, duplicated from the response.
    pub status: u16,
    #[serde(flatten)]
    pub code: ErrorCode,
    /// Per-field errors, present for validation failures.
    #[serde(default, skip_serializing_if = "Vec::is_empty")]
    pub errors: Vec<FieldError>,
    /// Correlation id to quote when reporting a problem.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub trace_id: Option<String>,
}
