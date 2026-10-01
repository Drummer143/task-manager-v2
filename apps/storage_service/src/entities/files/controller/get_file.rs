use axum::{
    body::Body,
    extract::State,
    http::{HeaderMap, StatusCode},
};
use error_handlers::{
    ApiError, ErrorCode,
    extract::{ApiPath, ApiQuery},
};
use serde::Deserialize;
use uuid::Uuid;

use crate::{
    db::blobs::BlobsRepository,
    entities::files::{
        serve::{ServeOptions, serve_blob},
        signing,
    },
    errors::{PublicFileErrors, SignedFileErrors, db_error},
    main_client::PUBLIC_ASSET_TTL,
    types::app_state::AppState,
};

#[derive(Deserialize)]
pub struct SignedFileQuery {
    /// The token from a link issued by `POST /files/links`.
    pub sig: Option<String>,
    pub filename: Option<String>,
    pub download: Option<bool>,
}

#[derive(Deserialize)]
pub struct PublicFileQuery {
    pub filename: Option<String>,
    pub download: Option<bool>,
}

/// Downloads a private file through a signed link. The signature is the credential: no
/// `Authorization` header is needed, so `<img>` and `<video>` tags work.
#[utoipa::path(
    get,
    path = "/files/{asset_id}",
    responses(
        (status = 200, description = "File content", body = String),
        (status = 206, description = "Partial content", body = String),
        SignedFileErrors,
    ),
    params(
        ("asset_id" = Uuid, Path, description = "Asset ID"),
        ("sig" = String, Query, description = "Token from a link issued by `POST /files/links`"),
        ("filename" = Option<String>, Query, description = "Name offered on download; overrides the asset name"),
        ("download" = Option<bool>, Query, description = "`true` forces a download instead of inline display"),
    ),
    tag = "Files",
    operation_id = "get_signed_file",
)]
pub async fn get_signed_file(
    State(state): State<AppState>,
    ApiPath(asset_id): ApiPath<Uuid>,
    ApiQuery(query): ApiQuery<SignedFileQuery>,
    headers: HeaderMap,
) -> Result<(StatusCode, HeaderMap, Body), ApiError> {
    let token = query
        .sig
        .as_deref()
        .ok_or_else(|| ApiError::new(ErrorCode::FileLinkInvalid).with_source("missing sig"))?;
    let claims = signing::verify(state.file_links.secret(), token, asset_id)?;

    let blob = BlobsRepository::get_one_by_id(&state.postgres, claims.blob)
        .await
        .map_err(db_error)?;

    // The link stops working at `exp`, so browsers must not keep the file longer than that.
    let remaining = claims.exp.saturating_sub(signing::now_secs());

    serve_blob(
        &blob,
        &headers,
        ServeOptions {
            file_name: query.filename.unwrap_or(claims.name),
            force_download: query.download.unwrap_or(false),
            cache_control: format!("private, max-age={remaining}"),
        },
    )
    .await
}

/// Downloads a public file. No credentials are needed, and the link is the same for everyone,
/// so published pages can embed it. Switching the asset back to private stops it working within
/// about a minute.
#[utoipa::path(
    get,
    path = "/public/files/{asset_id}",
    responses(
        (status = 200, description = "File content", body = String),
        (status = 206, description = "Partial content", body = String),
        PublicFileErrors,
    ),
    params(
        ("asset_id" = Uuid, Path, description = "Asset ID"),
        ("filename" = Option<String>, Query, description = "Name offered on download; overrides the asset name"),
        ("download" = Option<bool>, Query, description = "`true` forces a download instead of inline display"),
    ),
    tag = "Files",
    operation_id = "get_public_file",
)]
pub async fn get_public_file(
    State(state): State<AppState>,
    ApiPath(asset_id): ApiPath<Uuid>,
    ApiQuery(query): ApiQuery<PublicFileQuery>,
    headers: HeaderMap,
) -> Result<(StatusCode, HeaderMap, Body), ApiError> {
    // A private or unknown asset is a plain 404: the response must not reveal that it exists.
    let asset = state
        .main
        .public_asset(asset_id)
        .await?
        .ok_or_else(|| ApiError::new(ErrorCode::NotFound))?;

    let blob = BlobsRepository::get_one_by_id(&state.postgres, asset.blob_id)
        .await
        .map_err(db_error)?;

    serve_blob(
        &blob,
        &headers,
        ServeOptions {
            file_name: query.filename.unwrap_or(asset.name),
            force_download: query.download.unwrap_or(false),
            // Matches how long the public/private decision is cached, so un-publishing is not
            // hidden by browser caches for longer than it already takes.
            cache_control: format!("public, max-age={}", PUBLIC_ASSET_TTL.as_secs()),
        },
    )
    .await
}
