//! Error helpers local to the storage service.

use error_handlers::{ApiError, ErrorCode, error_set};

/// Maps a database error to an [`ApiError`].
///
/// `error_handlers` ships the same mapping behind its `sqlx` feature, but that feature targets the
/// workspace `sqlx`; this crate can switch to it once both use the same version.
pub fn db_error(err: sqlx::Error) -> ApiError {
    match &err {
        sqlx::Error::RowNotFound => ApiError::new(ErrorCode::NotFound),
        sqlx::Error::Database(db) if db.is_unique_violation() => {
            ApiError::new(ErrorCode::Conflict).with_source(err)
        }
        _ => ApiError::internal(err),
    }
}

// Error responses documented per endpoint in the OpenAPI spec. Codes that share a status become
// named examples of one response.

error_set!(
    /// `POST /actions/upload/init`
    pub UploadInitErrors => [
        ErrorCode::Unauthorized,
        ErrorCode::Forbidden,
        ErrorCode::UploadTokenInvalid,
        ErrorCode::MalformedRequest,
        ErrorCode::UnsupportedMediaType,
        ErrorCode::PayloadTooLarge,
        ErrorCode::InsufficientStorage,
        ErrorCode::Internal,
    ]
);

error_set!(
    /// `GET .../status` and `DELETE .../cancel`
    pub UploadTransactionErrors => [
        ErrorCode::Unauthorized,
        ErrorCode::Forbidden,
        ErrorCode::NotFound,
        ErrorCode::Internal,
    ]
);

error_set!(
    /// `POST .../chunk`
    pub UploadChunkErrors => [
        ErrorCode::Unauthorized,
        ErrorCode::Forbidden,
        ErrorCode::NotFound,
        ErrorCode::MalformedRequest,
        ErrorCode::UploadWrongStep { current_step: String::new() },
        ErrorCode::PayloadTooLarge,
        ErrorCode::InvalidChunkSize { max_bytes: 5_242_880 },
        ErrorCode::TooManyConcurrentUploads { max_concurrent: 3 },
        ErrorCode::Internal,
    ]
);

error_set!(
    /// `POST .../whole-file`
    pub UploadWholeFileErrors => [
        ErrorCode::Unauthorized,
        ErrorCode::Forbidden,
        ErrorCode::NotFound,
        ErrorCode::UploadWrongStep { current_step: String::new() },
        ErrorCode::Conflict,
        ErrorCode::PayloadTooLarge,
        ErrorCode::FileTooLarge { max_bytes: 15_728_640, actual_bytes: 20_971_520 },
        ErrorCode::FileSizeMismatch { expected_bytes: 1_048_576, actual_bytes: 1_048_000 },
        ErrorCode::FileHashMismatch,
        ErrorCode::Internal,
    ]
);

error_set!(
    /// `POST .../verify`
    pub UploadVerifyErrors => [
        ErrorCode::Unauthorized,
        ErrorCode::Forbidden,
        ErrorCode::NotFound,
        ErrorCode::MalformedRequest,
        ErrorCode::UnsupportedMediaType,
        ErrorCode::UploadWrongStep { current_step: String::new() },
        ErrorCode::PayloadTooLarge,
        ErrorCode::VerificationFailed,
        ErrorCode::Internal,
    ]
);

error_set!(
    /// `POST .../complete`
    pub UploadCompleteErrors => [
        ErrorCode::Unauthorized,
        ErrorCode::Forbidden,
        ErrorCode::NotFound,
        ErrorCode::UploadWrongStep { current_step: String::new() },
        ErrorCode::UploadIncomplete,
        ErrorCode::FileHashMismatch,
        ErrorCode::Conflict,
        ErrorCode::Internal,
    ]
);

error_set!(
    /// `GET /files/{asset_id}`
    pub GetFileErrors => [
        ErrorCode::Unauthorized,
        ErrorCode::Forbidden,
        ErrorCode::NotFound,
        ErrorCode::MalformedRequest,
        ErrorCode::Internal,
    ]
);

error_set!(
    /// `POST /internal/upload`
    pub InternalUploadErrors => [
        ErrorCode::MalformedRequest,
        ErrorCode::UnsupportedMediaType,
        ErrorCode::ValidationFailed,
        ErrorCode::Conflict,
        ErrorCode::PayloadTooLarge,
        ErrorCode::Internal,
    ]
);

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn missing_row_is_not_found() {
        assert_eq!(db_error(sqlx::Error::RowNotFound).code(), &ErrorCode::NotFound);
    }

    #[test]
    fn other_database_errors_are_internal_and_keep_the_cause_out_of_the_body() {
        let error = db_error(sqlx::Error::PoolTimedOut);

        assert_eq!(error.code(), &ErrorCode::Internal);
        let body = serde_json::to_string(&error.to_body()).unwrap();
        assert!(!body.to_lowercase().contains("pool"), "{body}");
    }
}
