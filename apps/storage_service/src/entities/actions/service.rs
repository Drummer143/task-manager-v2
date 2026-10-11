use std::{io::SeekFrom, path::Path, sync::LazyLock};

use crate::db::blobs::{BlobsRepository, CreateBlobDto};
use crate::errors::db_error;
use axum::body::Bytes;
use error_handlers::{ApiError, ErrorBody, ErrorCode};
use mime_guess::mime;
use rand::RngExt;
use sql_models::blobs::model::Blob;
use syntect::parsing::SyntaxSet;
use tokio::{
    fs::OpenOptions,
    io::{AsyncReadExt, AsyncSeekExt, AsyncWriteExt},
};
use uuid::Uuid;

/// Largest file accepted by the single-request upload; bigger files must be chunked.
const MAX_WHOLE_FILE_BYTES: usize = 15 * 1024 * 1024;

static SYNTAX_SET: LazyLock<SyntaxSet> = LazyLock::new(SyntaxSet::load_defaults_newlines);

use crate::{
    entities::actions::{
        dto::{
            AssetResponse, UploadChunkedResponse, UploadChunkedStatusResponse, UploadInitDto,
            UploadInitResponse, UploadStatusResponse, UploadSuccessResponse, UploadToken,
            UploadVerifyDto, UploadWholeFileResponse, VerifyRangesResponse,
            VerifyRangesStatusResponse,
        },
        shared::{build_path_to_assets_file, build_path_to_temp_file},
    },
    redis::{
        TransactionRepository,
        transaction::{NewTransaction, TransactionMeta, TransactionType, VerifyRange},
    },
    types::app_state::AppState,
};

pub struct ActionsService;

/// Only the user who started an upload may continue, complete or cancel it.
fn ensure_owner(meta: &TransactionMeta, user_id: Uuid) -> Result<(), ApiError> {
    if meta.user_id == user_id {
        Ok(())
    } else {
        Err(ApiError::new(ErrorCode::NotFound))
    }
}

impl ActionsService {
    fn generate_challenge_ranges(
        file_size: i64,
        sample_count: i64,
        sample_size: i64,
    ) -> Vec<VerifyRange> {
        // If file is smaller than total check size, request the whole file
        let total_check_size = sample_size * sample_count;

        if file_size <= total_check_size {
            return vec![VerifyRange {
                start: 0,
                end: file_size,
            }];
        }

        let mut rng = rand::rng();
        let mut ranges = Vec::with_capacity(sample_count as usize);

        let max_start = file_size - sample_size;

        for _ in 0..sample_count {
            let start = rng.random_range(0..=max_start);

            ranges.push(VerifyRange {
                start,
                end: start + sample_size,
            });
        }

        // Sort ranges for sequential disk reads
        ranges.sort_by_key(|r| r.start);

        // Merge overlapping ranges
        let mut merged = Vec::new();

        let mut current = ranges[0].clone();

        for next_range in ranges.into_iter().skip(1) {
            if next_range.start <= current.end {
                current.end = std::cmp::max(current.end, next_range.end);
            } else {
                merged.push(current);
                current = next_range;
            }
        }

        merged.push(current);

        merged
    }

    /// Loads a transaction that belongs to `user_id`. Someone else's transaction is reported as
    /// missing, so a transaction id alone neither reveals that it exists nor lets anyone act on it.
    async fn owned_transaction(
        state: &AppState,
        transaction_id: Uuid,
        user_id: Uuid,
    ) -> Result<TransactionMeta, ApiError> {
        let meta = TransactionRepository::get(&state.redis, transaction_id).await?;
        ensure_owner(&meta, user_id)?;
        Ok(meta)
    }

    pub async fn upload_init(
        state: &AppState,
        user_id: Uuid,
        body: UploadInitDto,
    ) -> Result<UploadInitResponse, ApiError> {
        let token = jsonwebtoken::decode::<UploadToken>(
            &body.upload_token,
            &jsonwebtoken::DecodingKey::from_secret(state.jwt_secret.as_bytes()),
            &jsonwebtoken::Validation::new(jsonwebtoken::Algorithm::HS256),
        )
        .map_err(|e| ApiError::new(ErrorCode::UploadTokenInvalid).with_source(e))?;

        if token.claims.user_id != user_id {
            return Err(ApiError::new(ErrorCode::UploadTokenInvalid)
                .with_source("user id does not match the upload token"));
        }

        let blob = BlobsRepository::get_one_by_hash(&state.postgres, &body.hash).await;

        match blob {
            Ok(blob) => {
                let transaction_id: Uuid = Uuid::now_v7();
                let ranges = Self::generate_challenge_ranges(blob.size, 10, 1024 * 1024);
                let repo_ranges = ranges.to_vec();

                TransactionRepository::create(
                    &state.redis,
                    transaction_id,
                    NewTransaction {
                        hash: body.hash,
                        size: body.size,
                        transaction_type: TransactionType::VerifyRanges {
                            ranges: repo_ranges,
                        },
                        token: body.upload_token,
                        filename: token.claims.name,
                        user_id,
                    },
                )
                .await?;

                Ok(UploadInitResponse::VerifyRanges(VerifyRangesResponse {
                    transaction_id,
                    ranges,
                }))
            }
            Err(sqlx::Error::RowNotFound) => {
                let transaction_id = Uuid::now_v7();

                let path_to_file =
                    build_path_to_temp_file(&state.temp_folder_path, &transaction_id);

                let file = tokio::fs::File::create(&path_to_file)
                    .await
                    .map_err(ApiError::internal)?;

                if let Err(error) = file.set_len(body.size).await {
                    if error.kind() == std::io::ErrorKind::OutOfMemory {
                        return Err(
                            ApiError::new(ErrorCode::InsufficientStorage).with_source(error)
                        );
                    }

                    return Err(ApiError::internal(error));
                }

                let (response, transaction_type) =
                    if body.size > crate::redis::transaction::CHUNK_SIZE * 3 {
                        (
                            UploadInitResponse::StartUploadChunked(UploadChunkedResponse {
                                transaction_id,
                                max_concurrent_uploads:
                                    crate::redis::transaction::MAX_CONCURRENT_UPLOADS,
                                chunk_size: crate::redis::transaction::CHUNK_SIZE,
                            }),
                            TransactionType::ChunkedUpload {
                                path_to_file: path_to_file.clone(),
                            },
                        )
                    } else {
                        (
                            UploadInitResponse::StartUploadWholeFile(UploadWholeFileResponse {
                                transaction_id,
                            }),
                            TransactionType::WholeFileUpload {
                                path_to_file: path_to_file.clone(),
                            },
                        )
                    };

                TransactionRepository::create(
                    &state.redis,
                    transaction_id,
                    NewTransaction {
                        hash: body.hash,
                        size: body.size,
                        transaction_type,
                        token: body.upload_token,
                        filename: token.claims.name,
                        user_id,
                    },
                )
                .await?;

                Ok(response)
            }
            Err(error) => Err(db_error(error)),
        }
    }

    pub async fn upload_verify(
        state: &AppState,
        user_id: Uuid,
        transaction_id: Uuid,
        body: UploadVerifyDto,
    ) -> Result<UploadSuccessResponse, ApiError> {
        let meta = Self::owned_transaction(state, transaction_id, user_id).await?;

        match meta.transaction_type {
            TransactionType::ChunkedUpload { .. } | TransactionType::WholeFileUpload { .. } => {
                Err(ApiError::new(ErrorCode::UploadWrongStep {
                    current_step: meta.transaction_type.step_name().into(),
                }))
            }
            TransactionType::VerifyRanges { ranges } => {
                // Get existing blob path from DB
                let blob = BlobsRepository::get_one_by_hash(&state.postgres, &meta.hash)
                    .await
                    .map_err(ApiError::internal)?;

                let mut file = tokio::fs::File::open(&blob.path)
                    .await
                    .map_err(ApiError::internal)?;

                let mut hasher = blake3::Hasher::new();

                for range in body.ranges {
                    hasher.update(&range);
                }

                let client_hash = hasher.finalize().to_string();

                hasher.reset();

                for range in ranges {
                    file.seek(std::io::SeekFrom::Start(range.start as u64))
                        .await
                        .map_err(ApiError::internal)?;

                    let range_size = range.end - range.start;

                    let mut buf = vec![0u8; range_size as usize];

                    file.read_exact(&mut buf)
                        .await
                        .map_err(ApiError::internal)?;

                    hasher.update(&buf);
                }

                let server_hash = hasher.finalize().to_string();

                if client_hash == server_hash {
                    TransactionRepository::delete(&state.redis, transaction_id).await?;

                    let asset =
                        Self::fetch_create_asset(state, blob, meta.token).await?;

                    Ok(UploadSuccessResponse {
                        asset,
                        mime_type: meta.mime_type,
                    })
                } else {
                    TransactionRepository::delete(&state.redis, transaction_id).await?;

                    Err(ApiError::new(ErrorCode::VerificationFailed))
                }
            }
        }
    }

    pub async fn fetch_create_asset(
        state: &AppState,
        blob: Blob,
        token: String,
    ) -> Result<AssetResponse, ApiError> {
        let resp = state
            .main
            .post("/assets")
            .json(&serde_json::json!({
                "blob": blob,
                "token": token,
            }))
            .send()
            .await
            .map_err(|e| ApiError::new(ErrorCode::UpstreamUnavailable).with_source(e))?;

        if !resp.status().is_success() {
            // The main service validates the upload token and speaks the same error contract, so
            // its verdict is passed on as is.
            Err(match resp.json::<ErrorBody>().await {
                Ok(body) => ApiError::from(body),
                Err(e) => ApiError::new(ErrorCode::UpstreamUnavailable).with_source(e),
            })
        } else {
            resp.json::<AssetResponse>()
                .await
                .map_err(|e| ApiError::new(ErrorCode::UpstreamUnavailable).with_source(e))
        }
    }

    pub async fn upload_whole_file(
        state: &AppState,
        user_id: Uuid,
        transaction_id: Uuid,
        body: Bytes,
    ) -> Result<UploadSuccessResponse, ApiError> {
        let meta = Self::owned_transaction(state, transaction_id, user_id).await?;

        let path_to_temp_file = match meta.transaction_type {
            TransactionType::WholeFileUpload { path_to_file } => Ok(path_to_file),
            _ => Err(ApiError::new(ErrorCode::UploadWrongStep {
                current_step: meta.transaction_type.step_name().into(),
            })),
        }?;

        if body.len() as u64 != meta.size {
            return Err(ApiError::new(ErrorCode::FileSizeMismatch {
                expected_bytes: meta.size,
                actual_bytes: body.len() as u64,
            }));
        }

        if body.len() > MAX_WHOLE_FILE_BYTES {
            return Err(ApiError::new(ErrorCode::FileTooLarge {
                max_bytes: MAX_WHOLE_FILE_BYTES as u64,
                actual_bytes: body.len() as u64,
            }));
        }

        let hash = blake3::hash(&body).to_string();

        if hash != meta.hash {
            return Err(ApiError::new(ErrorCode::FileHashMismatch));
        }

        let blob = match BlobsRepository::get_one_by_hash(&state.postgres, &hash).await {
            Ok(blob) => Ok(Some(blob)),
            Err(e) => match e {
                sqlx::Error::RowNotFound => Ok(None),
                _ => Err(db_error(e)),
            },
        }?;

        if let Some(blob) = blob {
            let asset = Self::fetch_create_asset(state, blob, meta.token).await?;

            return Ok(UploadSuccessResponse {
                asset,
                mime_type: meta.mime_type,
            });
        }

        let path_to_assets_file =
            build_path_to_assets_file(&state.assets_folder_path, &meta.hash, meta.size);

        let mut file = OpenOptions::new()
            .create(true)
            .truncate(false)
            .write(true)
            .open(&path_to_assets_file)
            .await
            .map_err(|e| {
                ApiError::internal(format!(
                    "error open file: {}. Path: {}",
                    e, path_to_assets_file
                ))
            })?;

        file.write_all(&body)
            .await
            .map_err(|e| ApiError::internal(format!("error write file: {}", e)))?;

        let result = tokio::fs::remove_file(&path_to_temp_file).await;

        if let Err(error) = result
            && error.kind() != std::io::ErrorKind::NotFound
        {
            return Err(ApiError::internal(format!("error remove file: {}", error)));
        }

        let mime_type = Self::detect_mime_type(&body, &meta.filename);

        let blob = BlobsRepository::create(
            &state.postgres,
            CreateBlobDto {
                hash,
                size: meta.size as i64,
                path: path_to_assets_file,
                mime_type: mime_type.clone(),
            },
        )
        .await
        .map_err(db_error)?;

        TransactionRepository::delete(&state.redis, transaction_id).await?;

        let asset = Self::fetch_create_asset(state, blob, meta.token).await?;

        Ok(UploadSuccessResponse { asset, mime_type })
    }

    async fn upload_chunk_inner(
        state: &AppState,
        meta: &crate::redis::transaction::TransactionMeta,
        transaction_id: Uuid,
        chunk_start: u64,
        body: Bytes,
    ) -> Result<(), ApiError> {
        let path_to_file = match &meta.transaction_type {
            TransactionType::ChunkedUpload { path_to_file } => path_to_file,
            _ => unreachable!(),
        };

        let mut file = OpenOptions::new()
            .write(true)
            .open(&path_to_file)
            .await
            .map_err(ApiError::internal)?;

        if chunk_start > 0 {
            file.seek(SeekFrom::Start(chunk_start))
                .await
                .map_err(ApiError::internal)?;
        }

        file.write_all(&body).await.map_err(ApiError::internal)?;

        // Mark chunk as uploaded
        let chunk_index = TransactionRepository::chunk_index_from_offset(chunk_start);
        TransactionRepository::set_chunk_uploaded(&state.redis, transaction_id, chunk_index)
            .await?;

        Ok(())
    }

    pub fn detect_mime_type(buffer: &[u8], filename: &str) -> String {
        // 1. BINARY FILES (Images, videos, archives)
        // infer works by "magic bytes" at the start of the file. This is the most reliable way for media.
        if let Some(kind) = infer::get(buffer) {
            return kind.mime_type().to_string();
        }

        // 2. CHECK IF IT IS A BINARY
        // If infer didn't find anything, check if it is a binary (presence of null-byte).
        let is_binary = buffer.contains(&0);

        // 3. IF IT IS A TEXT -> DEFINE LANGUAGE THROUGH SYNTECT
        if !is_binary {
            // Try to find syntax
            let syntax = if let Some(ext) = Path::new(filename).extension().and_then(|e| e.to_str())
            {
                // A. First try to find by extension (fast)
                SYNTAX_SET.find_syntax_by_extension(ext)
            } else {
                None
            };

            // B. If by extension didn't work (or there is no extension), try by first line (shebang)
            // Example: #!/usr/bin/env elixir
            let syntax = syntax.or_else(|| {
                // Take the first line from the buffer
                use std::io::BufRead;
                let mut first_line = String::new();
                if let Ok(reader) = std::io::Cursor::new(buffer).read_line(&mut first_line)
                    && reader > 0
                {
                    return SYNTAX_SET.find_syntax_by_first_line(&first_line);
                }
                None
            });

            if let Some(s) = syntax {
                // Syntect returns a type name "Elixir", "Rust", "JSON".
                // Convert this to MIME format: text/x-elixir
                let lang_name = s.name.to_lowercase();

                println!("lang_name: {}", lang_name);

                // Manual corrections for standards, if needed
                return match lang_name.as_str() {
                    "json" => "application/json".to_string(),
                    "typescript" => "application/typescript".to_string(),
                    // For everything else, we make text/x-{language}
                    _ => format!("text/x-{}", lang_name.replace(" ", "-")),
                };
            }
        }

        // 4. FALLBACK (If nothing helped)
        // Use file extension through mime_guess
        let mime_from_ext = mime_guess::from_path(filename).first_or_octet_stream();

        // If the file is text, but mime_guess returned octet-stream or media type -> force text/plain
        if !is_binary {
            if mime_from_ext.type_() == mime::APPLICATION
                && mime_from_ext.subtype() == mime::OCTET_STREAM
            {
                return "text/plain".to_string();
            }
            // Protection against .ts -> video/mp2t
            if mime_from_ext.type_() == mime::VIDEO || mime_from_ext.type_() == mime::AUDIO {
                return "text/plain".to_string();
            }
        }

        mime_from_ext.to_string()
    }

    pub async fn upload_chunk(
        state: &AppState,
        user_id: Uuid,
        transaction_id: Uuid,
        bytes_range: (u64, u64),
        body: Bytes,
    ) -> Result<(), ApiError> {
        let meta = Self::owned_transaction(state, transaction_id, user_id).await?;

        if !matches!(meta.transaction_type, TransactionType::ChunkedUpload { .. }) {
            return Err(ApiError::new(ErrorCode::UploadWrongStep {
                current_step: meta.transaction_type.step_name().into(),
            }));
        }

        let (start, end) = bytes_range;

        let chunk_size = end - start;

        // Validate chunk size for chunked uploads
        if chunk_size > crate::redis::transaction::CHUNK_SIZE || body.len() != chunk_size as usize {
            return Err(ApiError::new(ErrorCode::InvalidChunkSize {
                max_bytes: crate::redis::transaction::CHUNK_SIZE,
            }));
        }

        // Try to acquire upload slot (limit concurrent uploads)
        let acquired =
            TransactionRepository::try_acquire_upload_slot(&state.redis, transaction_id).await?;

        if !acquired {
            return Err(ApiError::new(ErrorCode::TooManyConcurrentUploads {
                max_concurrent: crate::redis::transaction::MAX_CONCURRENT_UPLOADS,
            }));
        }

        if start == 0 {
            let mime_type = Self::detect_mime_type(&body, &meta.filename);

            println!(
                "Mime type: {}. File name: {}. Buffer len: {}",
                mime_type,
                meta.filename,
                body.len()
            );

            if meta.mime_type != mime_type {
                TransactionRepository::set_mime_type(&state.redis, transaction_id, mime_type)
                    .await?;
            }
        }

        // Ensure slot is released on any exit path
        let result = Self::upload_chunk_inner(state, &meta, transaction_id, start, body).await;

        TransactionRepository::release_upload_slot(&state.redis, transaction_id).await?;

        result
    }

    pub async fn upload_status(
        state: &AppState,
        user_id: Uuid,
        transaction_id: Uuid,
    ) -> Result<UploadStatusResponse, ApiError> {
        let meta = Self::owned_transaction(state, transaction_id, user_id).await?;

        let response = match meta.transaction_type {
            TransactionType::ChunkedUpload { .. } => {
                let missing_chunks =
                    TransactionRepository::get_all_missing_chunks(&state.redis, transaction_id)
                        .await?;

                if missing_chunks.is_empty() {
                    UploadStatusResponse::Complete
                } else {
                    UploadStatusResponse::UploadChunked(UploadChunkedStatusResponse {
                        missing_chunks: Some(missing_chunks),
                        max_concurrent_uploads: crate::redis::transaction::MAX_CONCURRENT_UPLOADS,
                        chunk_size: crate::redis::transaction::CHUNK_SIZE,
                    })
                }
            }
            TransactionType::WholeFileUpload { .. } => UploadStatusResponse::UploadWholeFile,
            TransactionType::VerifyRanges { ranges } => {
                UploadStatusResponse::VerifyRanges(VerifyRangesStatusResponse { ranges })
            }
        };

        Ok(response)
    }

    pub async fn upload_cancel(
        state: &AppState,
        user_id: Uuid,
        transaction_id: Uuid,
    ) -> Result<(), ApiError> {
        let meta = Self::owned_transaction(state, transaction_id, user_id).await?;

        // Delete temp file if it exists
        if let TransactionType::ChunkedUpload { path_to_file }
        | TransactionType::WholeFileUpload { path_to_file } = meta.transaction_type
            && let Err(e) = tokio::fs::remove_file(&path_to_file).await
        {
            // Ignore NotFound errors - file may not have been created yet
            if e.kind() != std::io::ErrorKind::NotFound {
                return Err(ApiError::internal(e));
            }
        }

        TransactionRepository::delete(&state.redis, transaction_id).await?;

        Ok(())
    }

    pub async fn upload_complete(
        state: &AppState,
        user_id: Uuid,
        transaction_id: Uuid,
    ) -> Result<UploadSuccessResponse, ApiError> {
        let meta = Self::owned_transaction(state, transaction_id, user_id).await?;

        match meta.transaction_type {
            TransactionType::VerifyRanges { .. } => {
                Err(ApiError::new(ErrorCode::UploadWrongStep {
                    current_step: meta.transaction_type.step_name().into(),
                }))
            }
            TransactionType::ChunkedUpload {
                path_to_file: path_to_temp_file,
            }
            | TransactionType::WholeFileUpload {
                path_to_file: path_to_temp_file,
            } => {
                // Check if all chunks are uploaded
                let is_complete =
                    TransactionRepository::is_upload_complete(&state.redis, transaction_id).await?;

                if !is_complete {
                    return Err(ApiError::new(ErrorCode::UploadIncomplete));
                }

                // Use mmap + rayon for parallel hashing (much faster for large files)
                let path_clone = path_to_temp_file.clone();
                let hash =
                    tokio::task::spawn_blocking(move || -> Result<String, std::io::Error> {
                        let file = std::fs::File::open(&path_clone)?;
                        let mmap = unsafe { memmap2::Mmap::map(&file)? };
                        let hash = blake3::Hasher::new()
                            .update_rayon(&mmap)
                            .finalize()
                            .to_string();
                        Ok(hash)
                    })
                    .await
                    .map_err(ApiError::internal)?
                    .map_err(ApiError::internal)?;

                if meta.hash != hash {
                    tokio::fs::remove_file(&path_to_temp_file)
                        .await
                        .map_err(ApiError::internal)?;

                    TransactionRepository::delete(&state.redis, transaction_id).await?;

                    return Err(ApiError::new(ErrorCode::FileHashMismatch));
                }

                let path_to_asset_file =
                    build_path_to_assets_file(&state.assets_folder_path, &hash, meta.size);

                tokio::fs::rename(&path_to_temp_file, &path_to_asset_file)
                    .await
                    .map_err(ApiError::internal)?;

                TransactionRepository::delete(&state.redis, transaction_id).await?;

                let blob = BlobsRepository::create(
                    &state.postgres,
                    CreateBlobDto {
                        hash,
                        size: meta.size.try_into().unwrap(),
                        mime_type: meta.mime_type.clone(),
                        path: path_to_asset_file,
                    },
                )
                .await
                .map_err(db_error)?;

                let asset =
                    Self::fetch_create_asset(state, blob, meta.token).await?;

                Ok(UploadSuccessResponse {
                    asset,
                    mime_type: meta.mime_type,
                })
            }
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn meta_owned_by(user_id: Uuid) -> TransactionMeta {
        TransactionMeta {
            hash: String::new(),
            size: 0,
            total_chunks: 0,
            transaction_type: TransactionType::WholeFileUpload {
                path_to_file: String::new(),
            },
            token: String::new(),
            filename: String::new(),
            user_id,
            mime_type: String::new(),
        }
    }

    #[test]
    fn the_owner_may_act_on_the_transaction() {
        let owner = Uuid::now_v7();

        assert!(ensure_owner(&meta_owned_by(owner), owner).is_ok());
    }

    #[test]
    fn another_user_gets_not_found_not_forbidden() {
        let error = ensure_owner(&meta_owned_by(Uuid::now_v7()), Uuid::now_v7()).unwrap_err();

        assert_eq!(error.code(), &ErrorCode::NotFound);
    }

    #[test]
    fn transactions_saved_before_owners_existed_match_nobody() {
        // They deserialize with the nil UUID; no real user has it.
        let legacy: TransactionMeta = serde_json::from_str(
            r#"{"hash":"h","size":1,"total_chunks":1,"token":"t","filename":"f",
                "transaction_type":{"whole_file_upload":{"path_to_file":"p"}}}"#,
        )
        .unwrap();

        assert_eq!(legacy.user_id, Uuid::nil());
        assert!(ensure_owner(&legacy, Uuid::now_v7()).is_err());
    }
}
