use std::sync::Arc;

use deadpool_redis::redis::AsyncCommands;
use uuid::Uuid;

use super::error::RedisError;

/// Default TTL: 3 days in seconds
const DEFAULT_TTL_SECONDS: u64 = 3 * 24 * 60 * 60;

/// TTL for active uploads counter: 1 minute
pub const ACTIVE_UPLOADS_TTL_SECONDS: u64 = 60;

/// Max concurrent chunk uploads per transaction
pub const MAX_CONCURRENT_UPLOADS: u64 = 3;

/// Chunk size: 5MB
pub const CHUNK_SIZE: u64 = 5 * 1024 * 1024;

#[derive(Debug, Clone, serde::Serialize, serde::Deserialize)]
pub struct TransactionMeta {
    pub hash: String,
    pub size: u64,
    pub total_chunks: u64,
    pub transaction_type: TransactionType,
    pub token: String,
    pub filename: String,
    #[serde(default)]
    pub mime_type: String,
}

#[derive(Debug, Clone, serde::Serialize, serde::Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum TransactionType {
    ChunkedUpload { path_to_file: String },
    WholeFileUpload { path_to_file: String },
    VerifyRanges { ranges: Vec<VerifyRange> },
}

impl TransactionType {
    /// Stable name of the step, sent to clients as the `current_step` error param.
    pub fn step_name(&self) -> &'static str {
        match self {
            Self::ChunkedUpload { .. } => "chunked_upload",
            Self::WholeFileUpload { .. } => "whole_file_upload",
            Self::VerifyRanges { .. } => "verify_ranges",
        }
    }
}

#[derive(Debug, Clone, serde::Serialize, serde::Deserialize, utoipa::ToSchema)]
pub struct VerifyRange {
    pub start: i64,
    pub end: i64,
}

pub struct TransactionRepository;

impl TransactionRepository {
    /// Generates key for transaction metadata
    fn meta_key(transaction_id: Uuid) -> String {
        format!("tx:{}:meta", transaction_id)
    }

    /// Generates key for uploaded chunks bitmap
    fn chunks_key(transaction_id: Uuid) -> String {
        format!("tx:{}:chunks", transaction_id)
    }

    /// Generates key for active uploads counter
    fn active_uploads_key(transaction_id: Uuid) -> String {
        format!("tx:{}:active", transaction_id)
    }

    /// Key for the ZSET containing transaction activity timestamps
    fn activity_zset_key() -> &'static str {
        "tx_activity"
    }

    /// Updates the last activity timestamp for a transaction
    pub async fn update_activity(
        pool: &Arc<deadpool_redis::Pool>,
        transaction_id: Uuid,
    ) -> Result<(), RedisError> {
        let mut conn = pool.get().await?;
        let now = std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .unwrap_or_default()
            .as_secs() as f64;
            
        conn.zadd::<_, _, _, ()>(Self::activity_zset_key(), transaction_id.to_string(), now)
            .await?;
            
        Ok(())
    }

    /// Gets inactive transaction IDs older than the given timestamp
    pub async fn get_inactive_transactions(
        pool: &Arc<deadpool_redis::Pool>,
        older_than_timestamp: f64,
    ) -> Result<Vec<Uuid>, RedisError> {
        let mut conn = pool.get().await?;
        let inactive: Vec<String> = conn
            .zrangebyscore(Self::activity_zset_key(), 0.0, older_than_timestamp)
            .await?;

        let mut uuids = Vec::new();
        for id_str in inactive {
            if let Ok(uuid) = Uuid::parse_str(&id_str) {
                uuids.push(uuid);
            }
        }
        
        Ok(uuids)
    }

    /// Creates a new upload transaction
    pub async fn create(
        pool: &Arc<deadpool_redis::Pool>,
        transaction_id: Uuid,
        hash: String,
        size: u64,
        transaction_type: TransactionType,
        token: String,
        filename: String,
    ) -> Result<TransactionMeta, RedisError> {
        let mut conn = pool.get().await?;

        let total_chunks = size.div_ceil(CHUNK_SIZE);

        let meta = TransactionMeta {
            hash,
            size,
            total_chunks,
            transaction_type,
            token,
            mime_type: "application/octet-stream".into(),
            filename,
        };

        let meta_json = serde_json::to_string(&meta)?;
        let key = Self::meta_key(transaction_id);

        conn.set_ex::<_, _, ()>(&key, &meta_json, DEFAULT_TTL_SECONDS)
            .await?;

        // Update activity timestamp
        let now = std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .unwrap_or_default()
            .as_secs() as f64;
        conn.zadd::<_, _, _, ()>(Self::activity_zset_key(), transaction_id.to_string(), now)
            .await?;

        Ok(meta)
    }

    /// Retrieves transaction metadata
    pub async fn get(
        pool: &Arc<deadpool_redis::Pool>,
        transaction_id: Uuid,
    ) -> Result<TransactionMeta, RedisError> {
        let mut conn = pool.get().await?;
        let key = Self::meta_key(transaction_id);

        let meta_json: Option<String> = conn.get(&key).await?;

        match meta_json {
            Some(json) => Ok(serde_json::from_str(&json)?),
            None => Err(RedisError::NotFound),
        }
    }

    /// Deletes transaction (metadata + chunks bitmap + active counter)
    pub async fn delete(
        pool: &Arc<deadpool_redis::Pool>,
        transaction_id: Uuid,
    ) -> Result<(), RedisError> {
        let mut conn = pool.get().await?;

        let meta_key = Self::meta_key(transaction_id);
        let chunks_key = Self::chunks_key(transaction_id);
        let active_key = Self::active_uploads_key(transaction_id);

        conn.del::<_, ()>(&[&meta_key, &chunks_key, &active_key])
            .await?;
            
        conn.zrem::<_, _, ()>(Self::activity_zset_key(), transaction_id.to_string())
            .await?;

        Ok(())
    }

    /// Tries to acquire upload slot. Returns Ok(true) if acquired, Ok(false) if limit reached.
    pub async fn try_acquire_upload_slot(
        pool: &Arc<deadpool_redis::Pool>,
        transaction_id: Uuid,
    ) -> Result<bool, RedisError> {
        let mut conn = pool.get().await?;
        let key = Self::active_uploads_key(transaction_id);

        // INCR and check if within limit
        let count: u64 = conn.incr(&key, 1).await?;

        // Set TTL on first increment (or refresh)
        conn.expire::<_, ()>(&key, ACTIVE_UPLOADS_TTL_SECONDS as i64)
            .await?;

        if count > MAX_CONCURRENT_UPLOADS {
            // Over limit - decrement and reject
            conn.decr::<_, _, ()>(&key, 1).await?;
            Ok(false)
        } else {
            Ok(true)
        }
    }

    /// Releases upload slot after chunk upload completes
    pub async fn release_upload_slot(
        pool: &Arc<deadpool_redis::Pool>,
        transaction_id: Uuid,
    ) -> Result<(), RedisError> {
        let mut conn = pool.get().await?;
        let key = Self::active_uploads_key(transaction_id);

        // Decrement, but don't go below 0
        let count: i64 = conn.decr(&key, 1).await?;
        if count < 0 {
            conn.set::<_, _, ()>(&key, 0).await?;
        }

        Ok(())
    }

    /// Marks chunk as uploaded (sets bit in bitmap)
    pub async fn set_chunk_uploaded(
        pool: &Arc<deadpool_redis::Pool>,
        transaction_id: Uuid,
        chunk_index: u64,
    ) -> Result<(), RedisError> {
        let mut conn = pool.get().await?;
        let key = Self::chunks_key(transaction_id);

        // SETBIT returns the previous bit value
        conn.setbit::<_, ()>(&key, chunk_index as usize, true)
            .await?;

        // Refresh TTL for bitmap
        conn.expire::<_, ()>(&key, DEFAULT_TTL_SECONDS as i64)
            .await?;

        // Update activity timestamp
        let now = std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .unwrap_or_default()
            .as_secs() as f64;
        conn.zadd::<_, _, _, ()>(Self::activity_zset_key(), transaction_id.to_string(), now)
            .await?;

        Ok(())
    }

    // /// Checks if a specific chunk is uploaded
    // pub async fn is_chunk_uploaded(
    //     pool: &Arc<deadpool_redis::Pool>,
    //     transaction_id: Uuid,
    //     chunk_index: u64,
    // ) -> Result<bool, RedisError> {
    //     let mut conn = pool.get().await?;
    //     let key = Self::chunks_key(transaction_id);

    //     let bit: bool = conn.getbit(&key, chunk_index as usize).await?;

    //     Ok(bit)
    // }

    /// Returns the count of uploaded chunks
    pub async fn get_uploaded_chunks_count(
        pool: &Arc<deadpool_redis::Pool>,
        transaction_id: Uuid,
    ) -> Result<u64, RedisError> {
        let mut conn = pool.get().await?;
        let key = Self::chunks_key(transaction_id);

        let count: u64 = conn.bitcount(&key).await?;

        Ok(count)
    }

    /// Checks if all chunks are uploaded
    pub async fn is_upload_complete(
        pool: &Arc<deadpool_redis::Pool>,
        transaction_id: Uuid,
    ) -> Result<bool, RedisError> {
        let meta = Self::get(pool, transaction_id).await?;
        let uploaded = Self::get_uploaded_chunks_count(pool, transaction_id).await?;

        Ok(uploaded >= meta.total_chunks)
    }

    /// Returns all missing chunk indices (or empty vec if all uploaded)
    pub async fn get_all_missing_chunks(
        pool: &Arc<deadpool_redis::Pool>,
        transaction_id: Uuid,
    ) -> Result<Vec<u64>, RedisError> {
        let mut conn = pool.get().await?;
        let meta = Self::get(pool, transaction_id).await?;
        let key = Self::chunks_key(transaction_id);

        let bitmap: Option<Vec<u8>> = conn.get(&key).await?;

        let mut missing = Vec::new();

        match bitmap {
            None => {
                // No bitmap exists — all chunks are missing
                missing.extend(0..meta.total_chunks);
            }
            Some(bytes) => {
                for chunk_idx in 0..meta.total_chunks {
                    let byte_idx = (chunk_idx / 8) as usize;
                    let bit_idx = 7 - (chunk_idx % 8); // Redis stores bits in MSB order

                    let is_uploaded = bytes
                        .get(byte_idx)
                        .map(|b| (b >> bit_idx) & 1 == 1)
                        .unwrap_or(false);

                    if !is_uploaded {
                        missing.push(chunk_idx);
                    }
                }
            }
        }

        Ok(missing)
    }

    /// Calculates chunk index from byte offset
    pub fn chunk_index_from_offset(offset: u64) -> u64 {
        offset / CHUNK_SIZE
    }

    /// Updates the mime_type in transaction metadata
    pub async fn set_mime_type(
        pool: &Arc<deadpool_redis::Pool>,
        transaction_id: Uuid,
        mime_type: String,
    ) -> Result<(), RedisError> {
        let mut meta = Self::get(pool, transaction_id).await?;
        meta.mime_type = mime_type;

        let mut conn = pool.get().await?;
        let key = Self::meta_key(transaction_id);
        let meta_json = serde_json::to_string(&meta)?;

        conn.set_ex::<_, _, ()>(&key, &meta_json, DEFAULT_TTL_SECONDS)
            .await?;

        Ok(())
    }

    // /// Calculates expected byte range for a chunk
    // pub fn chunk_byte_range(chunk_index: u64, file_size: u64) -> (u64, u64) {
    //     let start = chunk_index * CHUNK_SIZE;
    //     let end = std::cmp::min(start + CHUNK_SIZE, file_size);
    //     (start, end)
    // }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_chunk_index_from_offset() {
        assert_eq!(TransactionRepository::chunk_index_from_offset(0), 0);
        assert_eq!(
            TransactionRepository::chunk_index_from_offset(5 * 1024 * 1024 - 1),
            0
        );
        assert_eq!(
            TransactionRepository::chunk_index_from_offset(5 * 1024 * 1024),
            1
        );
        assert_eq!(
            TransactionRepository::chunk_index_from_offset(10 * 1024 * 1024),
            2
        );
    }

    // #[test]
    // fn test_chunk_byte_range() {
    //     let file_size = 12 * 1024 * 1024; // 12MB = 3 chunks (5, 5, 2)

    //     assert_eq!(
    //         TransactionRepository::chunk_byte_range(0, file_size),
    //         (0, 5 * 1024 * 1024)
    //     );
    //     assert_eq!(
    //         TransactionRepository::chunk_byte_range(1, file_size),
    //         (5 * 1024 * 1024, 10 * 1024 * 1024)
    //     );
    //     assert_eq!(
    //         TransactionRepository::chunk_byte_range(2, file_size),
    //         (10 * 1024 * 1024, 12 * 1024 * 1024)
    //     );
    // }
}
