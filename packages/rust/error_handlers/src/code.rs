use serde::{Deserialize, Serialize};

/// Every error the API can return.
///
/// Serialized as `{"code": "FILE_TOO_LARGE", "params": {...}}`; variants without data have no
/// `params`. Codes are a public contract: never rename one, only add or deprecate.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[cfg_attr(feature = "openapi", derive(utoipa::ToSchema))]
#[serde(tag = "code", content = "params", rename_all = "SCREAMING_SNAKE_CASE")]
pub enum ErrorCode {
    /// The request failed validation; see `errors` for per-field details.
    ValidationFailed,
    /// The requested resource does not exist.
    NotFound,
    /// The request conflicts with the current state of the resource.
    Conflict,
    /// Authentication is missing or invalid.
    Unauthorized,
    /// The caller is not allowed to perform this action.
    Forbidden,
    /// Unexpected server failure. Details are only available in server logs.
    Internal,
    /// A required field is missing. Used in per-field errors.
    Required,
    /// A field has an invalid format. Used in per-field errors.
    InvalidFormat,
    /// The request could not be parsed: malformed JSON, or a body, query or path parameter of the wrong shape.
    MalformedRequest,
    /// The request body has an unsupported `Content-Type`; JSON endpoints expect `application/json`.
    UnsupportedMediaType,
    /// The request body exceeds the size limit of the endpoint.
    PayloadTooLarge,
    /// The HTTP method is not supported by this endpoint; see the `Allow` response header.
    MethodNotAllowed,
    /// The server did not finish handling the request in time. The request may be retried.
    Timeout,
    /// The uploaded file exceeds the size limit.
    FileTooLarge {
        /// Maximum allowed size in bytes.
        max_bytes: u64,
        /// Size of the uploaded file in bytes.
        actual_bytes: u64,
    },
    /// The upload token is invalid, expired, or was issued to another user.
    UploadTokenInvalid,
    /// The upload transaction is not in the step this endpoint serves.
    UploadWrongStep {
        /// Step the transaction is currently in: `chunked_upload`, `whole_file_upload` or `verify_ranges`.
        current_step: String,
    },
    /// Not all chunks of the upload have been received yet.
    UploadIncomplete,
    /// The size of the uploaded content differs from the size announced at upload init.
    FileSizeMismatch {
        /// Size announced at upload init, in bytes.
        expected_bytes: u64,
        /// Size actually received, in bytes.
        actual_bytes: u64,
    },
    /// The content hash of the uploaded file differs from the hash announced at upload init.
    FileHashMismatch,
    /// A chunk has a size that does not match its `Content-Range` or exceeds the chunk limit.
    InvalidChunkSize {
        /// Maximum allowed chunk size in bytes.
        max_bytes: u64,
    },
    /// Too many chunks of this upload are in flight; retry shortly.
    TooManyConcurrentUploads {
        /// Maximum number of chunks that may be uploaded concurrently.
        max_concurrent: u64,
    },
    /// Ownership verification of an already stored file failed.
    VerificationFailed,
    /// The server has no room left to store the file.
    InsufficientStorage,
    /// The signed file link is malformed, has a bad signature, or belongs to another file.
    FileLinkInvalid,
    /// The signed file link has expired; request a new one.
    FileLinkExpired,
    /// A request carries more items than a single call may process.
    TooManyItems {
        /// Maximum number of items per request.
        max_items: u64,
    },
    /// A service this one depends on did not answer or answered with something unusable.
    UpstreamUnavailable,
}

impl ErrorCode {
    /// One sample of every code, with placeholder params. Feeds generated docs and the code catalog.
    pub fn examples() -> Vec<ErrorCode> {
        vec![
            Self::ValidationFailed,
            Self::NotFound,
            Self::Conflict,
            Self::Unauthorized,
            Self::Forbidden,
            Self::Internal,
            Self::Required,
            Self::InvalidFormat,
            Self::MalformedRequest,
            Self::UnsupportedMediaType,
            Self::PayloadTooLarge,
            Self::MethodNotAllowed,
            Self::Timeout,
            Self::FileTooLarge {
                max_bytes: 5_242_880,
                actual_bytes: 9_437_184,
            },
            Self::UploadTokenInvalid,
            Self::UploadWrongStep {
                current_step: "verify_ranges".into(),
            },
            Self::UploadIncomplete,
            Self::FileSizeMismatch {
                expected_bytes: 1_048_576,
                actual_bytes: 1_048_000,
            },
            Self::FileHashMismatch,
            Self::InvalidChunkSize {
                max_bytes: 5_242_880,
            },
            Self::TooManyConcurrentUploads { max_concurrent: 3 },
            Self::VerificationFailed,
            Self::InsufficientStorage,
            Self::FileLinkInvalid,
            Self::FileLinkExpired,
            Self::TooManyItems { max_items: 200 },
            Self::UpstreamUnavailable,
        ]
    }

    /// HTTP status this code is returned with.
    pub fn status(&self) -> u16 {
        match self {
            Self::ValidationFailed
            | Self::Required
            | Self::InvalidFormat
            | Self::FileSizeMismatch { .. }
            | Self::FileHashMismatch
            | Self::InvalidChunkSize { .. }
            | Self::VerificationFailed
            | Self::TooManyItems { .. } => 422,
            Self::NotFound => 404,
            Self::Conflict | Self::UploadWrongStep { .. } | Self::UploadIncomplete => 409,
            Self::Unauthorized => 401,
            Self::Forbidden
            | Self::UploadTokenInvalid
            | Self::FileLinkInvalid
            | Self::FileLinkExpired => 403,
            Self::Internal => 500,
            Self::MalformedRequest => 400,
            Self::UnsupportedMediaType => 415,
            Self::MethodNotAllowed => 405,
            Self::Timeout => 504,
            Self::TooManyConcurrentUploads { .. } => 429,
            Self::InsufficientStorage => 507,
            Self::UpstreamUnavailable => 502,
            Self::PayloadTooLarge | Self::FileTooLarge { .. } => 413,
        }
    }

    /// The wire name of the code (same as the serialized `code` field).
    pub fn as_str(&self) -> &'static str {
        match self {
            Self::ValidationFailed => "VALIDATION_FAILED",
            Self::NotFound => "NOT_FOUND",
            Self::Conflict => "CONFLICT",
            Self::Unauthorized => "UNAUTHORIZED",
            Self::Forbidden => "FORBIDDEN",
            Self::Internal => "INTERNAL",
            Self::Required => "REQUIRED",
            Self::InvalidFormat => "INVALID_FORMAT",
            Self::MalformedRequest => "MALFORMED_REQUEST",
            Self::UnsupportedMediaType => "UNSUPPORTED_MEDIA_TYPE",
            Self::PayloadTooLarge => "PAYLOAD_TOO_LARGE",
            Self::MethodNotAllowed => "METHOD_NOT_ALLOWED",
            Self::Timeout => "TIMEOUT",
            Self::FileTooLarge { .. } => "FILE_TOO_LARGE",
            Self::UploadTokenInvalid => "UPLOAD_TOKEN_INVALID",
            Self::UploadWrongStep { .. } => "UPLOAD_WRONG_STEP",
            Self::UploadIncomplete => "UPLOAD_INCOMPLETE",
            Self::FileSizeMismatch { .. } => "FILE_SIZE_MISMATCH",
            Self::FileHashMismatch => "FILE_HASH_MISMATCH",
            Self::InvalidChunkSize { .. } => "INVALID_CHUNK_SIZE",
            Self::TooManyConcurrentUploads { .. } => "TOO_MANY_CONCURRENT_UPLOADS",
            Self::VerificationFailed => "VERIFICATION_FAILED",
            Self::InsufficientStorage => "INSUFFICIENT_STORAGE",
            Self::FileLinkInvalid => "FILE_LINK_INVALID",
            Self::FileLinkExpired => "FILE_LINK_EXPIRED",
            Self::TooManyItems { .. } => "TOO_MANY_ITEMS",
            Self::UpstreamUnavailable => "UPSTREAM_UNAVAILABLE",
        }
    }

    /// RFC 9457 `type`: a stable URI identifying the class of problem.
    pub fn problem_type(&self) -> String {
        format!(
            "urn:task-manager:error:{}",
            self.as_str().to_lowercase().replace('_', "-")
        )
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn as_str_matches_serialized_code() {
        for code in ErrorCode::examples() {
            let json = serde_json::to_value(&code).unwrap();
            assert_eq!(json["code"], code.as_str());
        }
    }

    #[test]
    fn codes_are_unique() {
        let mut names: Vec<_> = ErrorCode::examples()
            .iter()
            .map(ErrorCode::as_str)
            .collect();
        names.sort_unstable();
        names.dedup();
        assert_eq!(names.len(), ErrorCode::examples().len());
    }

    #[test]
    fn every_code_survives_a_json_round_trip() {
        for code in ErrorCode::examples() {
            let json = serde_json::to_string(&code).unwrap();
            let back: ErrorCode = serde_json::from_str(&json).unwrap();
            assert_eq!(back, code, "{json}");
        }
    }

    #[test]
    fn params_are_present_only_for_data_variants() {
        let unit = serde_json::to_value(ErrorCode::NotFound).unwrap();
        assert!(unit.get("params").is_none());

        let data = serde_json::to_value(ErrorCode::FileTooLarge {
            max_bytes: 5,
            actual_bytes: 9,
        })
        .unwrap();
        assert_eq!(data["params"]["max_bytes"], 5);
        assert_eq!(data["params"]["actual_bytes"], 9);
    }
}
