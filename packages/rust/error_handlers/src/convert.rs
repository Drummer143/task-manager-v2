use crate::{ApiError, ErrorCode};

impl From<sqlx::Error> for ApiError {
    fn from(err: sqlx::Error) -> Self {
        match &err {
            sqlx::Error::RowNotFound => Self::new(ErrorCode::NotFound),
            sqlx::Error::Database(db) if db.is_unique_violation() => {
                Self::new(ErrorCode::Conflict).with_source(err)
            }
            _ => Self::internal(err),
        }
    }
}
