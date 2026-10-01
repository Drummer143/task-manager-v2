use axum::response::IntoResponse;
use error_handlers::{ApiError, ErrorCode};

#[derive(Debug)]
pub enum RedisError {
    Pool(deadpool_redis::PoolError),
    Redis(deadpool_redis::redis::RedisError),
    Serialization(serde_json::Error),
    NotFound,
}

impl From<deadpool_redis::PoolError> for RedisError {
    fn from(err: deadpool_redis::PoolError) -> Self {
        RedisError::Pool(err)
    }
}

impl From<deadpool_redis::redis::RedisError> for RedisError {
    fn from(err: deadpool_redis::redis::RedisError) -> Self {
        RedisError::Redis(err)
    }
}

impl From<serde_json::Error> for RedisError {
    fn from(err: serde_json::Error) -> Self {
        RedisError::Serialization(err)
    }
}

impl From<RedisError> for ApiError {
    fn from(err: RedisError) -> Self {
        match err {
            RedisError::Pool(e) => ApiError::internal(e),
            RedisError::Redis(e) => ApiError::internal(e),
            RedisError::Serialization(e) => ApiError::internal(e),
            RedisError::NotFound => ApiError::new(ErrorCode::NotFound),
        }
    }
}

impl IntoResponse for RedisError {
    fn into_response(self) -> axum::response::Response {
        ApiError::from(self).into_response()
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn missing_transaction_is_not_found() {
        assert_eq!(ApiError::from(RedisError::NotFound).code(), &ErrorCode::NotFound);
    }

    #[test]
    fn infrastructure_failures_are_internal() {
        let error = serde_json::from_str::<u8>("nope").unwrap_err();

        assert_eq!(
            ApiError::from(RedisError::Serialization(error)).code(),
            &ErrorCode::Internal
        );
    }
}
