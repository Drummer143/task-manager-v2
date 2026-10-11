//! Serving a stored blob over HTTP: Range requests, streaming, and safe response headers.
//!
//! Files are user-uploaded, so they must not be able to run in the app's origin. Every response
//! therefore carries `X-Content-Type-Options: nosniff` and a sandboxing CSP, and only images,
//! video and audio are displayed inline; everything else is a download.

use std::path::Path;

use axum::{
    body::Body,
    http::{HeaderMap, HeaderValue, StatusCode, header},
};
use error_handlers::{ApiError, ErrorCode};
use sql_models::blobs::model::Blob;
use tokio::{
    fs::File,
    io::{AsyncReadExt, AsyncSeekExt},
};
use tokio_util::io::ReaderStream;

pub struct ServeOptions {
    /// Name offered to the browser on download.
    pub file_name: String,
    /// Force a download even for types that would be shown inline.
    pub force_download: bool,
    /// Value of `Cache-Control`.
    pub cache_control: String,
}

#[derive(Debug, PartialEq, Eq)]
struct ByteRange {
    start: u64,
    end: u64,
}

pub async fn serve_blob(
    blob: &Blob,
    request_headers: &HeaderMap,
    options: ServeOptions,
) -> Result<(StatusCode, HeaderMap, Body), ApiError> {
    let path = Path::new(&blob.path);
    let mut file = match File::open(path).await {
        Ok(file) => file,
        // The row exists but the file is gone: nothing to serve.
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => {
            return Err(ApiError::new(ErrorCode::NotFound).with_source(error));
        }
        Err(error) => return Err(ApiError::internal(error)),
    };
    let file_size = file.metadata().await.map_err(ApiError::internal)?.len();

    let mut headers = base_headers(blob, &options);

    let range = request_headers
        .get(header::RANGE)
        .and_then(|value| value.to_str().ok())
        .and_then(|value| parse_range_header(value, file_size));

    let (status, length, body) = match range {
        Some(range) => {
            file.seek(std::io::SeekFrom::Start(range.start))
                .await
                .map_err(ApiError::internal)?;
            let length = range.end - range.start + 1;
            headers.insert(
                header::CONTENT_RANGE,
                header_value(&format!("bytes {}-{}/{file_size}", range.start, range.end)),
            );
            // Stream just the requested window instead of loading it into memory: `bytes=0-`
            // on a large video asks for the whole file.
            let body = Body::from_stream(ReaderStream::new(file.take(length)));
            (StatusCode::PARTIAL_CONTENT, length, body)
        }
        None => (
            StatusCode::OK,
            file_size,
            Body::from_stream(ReaderStream::new(file)),
        ),
    };

    headers.insert(header::CONTENT_LENGTH, header_value(&length.to_string()));
    Ok((status, headers, body))
}

fn base_headers(blob: &Blob, options: &ServeOptions) -> HeaderMap {
    let mut headers = HeaderMap::new();

    // A stored MIME type that is not a valid header value must not take the endpoint down.
    let content_type = HeaderValue::from_str(&blob.mime_type)
        .unwrap_or_else(|_| HeaderValue::from_static("application/octet-stream"));
    headers.insert(header::CONTENT_TYPE, content_type);
    headers.insert(header::ACCEPT_RANGES, HeaderValue::from_static("bytes"));
    headers.insert(
        header::CONTENT_DISPOSITION,
        header_value(&content_disposition(
            &options.file_name,
            options.force_download || !is_inline_safe(&blob.mime_type),
        )),
    );
    headers.insert(
        header::CACHE_CONTROL,
        HeaderValue::from_str(&options.cache_control)
            .unwrap_or_else(|_| HeaderValue::from_static("no-store")),
    );
    headers.insert(
        header::X_CONTENT_TYPE_OPTIONS,
        HeaderValue::from_static("nosniff"),
    );
    headers.insert(
        header::CONTENT_SECURITY_POLICY,
        HeaderValue::from_static("default-src 'none'; sandbox"),
    );
    headers
}

/// Values built here are ASCII by construction; fall back to empty rather than panic.
fn header_value(value: &str) -> HeaderValue {
    HeaderValue::from_str(value).unwrap_or_else(|_| HeaderValue::from_static(""))
}

/// Types a browser can show without executing anything of the uploader's.
fn is_inline_safe(mime_type: &str) -> bool {
    let essence = mime_type.split(';').next().unwrap_or_default().trim();
    ["image/", "video/", "audio/"]
        .iter()
        .any(|prefix| essence.starts_with(prefix))
}

/// `Content-Disposition` with an ASCII fallback name and the real name as RFC 5987 `filename*`.
fn content_disposition(file_name: &str, attachment: bool) -> String {
    let kind = if attachment { "attachment" } else { "inline" };

    let name = if file_name.trim().is_empty() {
        "file"
    } else {
        file_name
    };
    let ascii: String = name
        .chars()
        .map(|c| {
            if c.is_ascii_alphanumeric() || matches!(c, '.' | '-' | '_' | ' ') {
                c
            } else {
                '_'
            }
        })
        .collect();

    let mut encoded = String::with_capacity(name.len() * 3);
    for byte in name.bytes() {
        if byte.is_ascii_alphanumeric()
            || matches!(byte, b'!' | b'#' | b'$' | b'&' | b'+' | b'-' | b'.' | b'^' | b'_' | b'`' | b'|' | b'~')
        {
            encoded.push(byte as char);
        } else {
            encoded.push_str(&format!("%{byte:02X}"));
        }
    }

    format!("{kind}; filename=\"{ascii}\"; filename*=UTF-8''{encoded}")
}

/// `bytes=a-b`, `bytes=a-` and `bytes=-n`. An unusable range yields `None`, and the whole file is
/// served instead, which the HTTP spec allows.
fn parse_range_header(range: &str, file_size: u64) -> Option<ByteRange> {
    // Nothing can be sliced out of an empty file.
    if file_size == 0 {
        return None;
    }

    let spec = range.strip_prefix("bytes=")?;
    let (first, last) = spec.split_once('-')?;
    if last.contains('-') {
        return None;
    }

    let start = if first.is_empty() {
        // Suffix range: the last `n` bytes.
        file_size.saturating_sub(last.parse::<u64>().ok()?)
    } else {
        first.parse::<u64>().ok()?
    };
    let end = if last.is_empty() || first.is_empty() {
        file_size - 1
    } else {
        last.parse::<u64>().ok()?.min(file_size - 1)
    };

    (start <= end && start < file_size).then_some(ByteRange { start, end })
}

#[cfg(test)]
mod tests {
    use axum::body::to_bytes;
    use sqlx::types::chrono::Utc;
    use uuid::Uuid;

    use super::*;

    fn range(spec: &str, size: u64) -> Option<(u64, u64)> {
        parse_range_header(spec, size).map(|r| (r.start, r.end))
    }

    #[test]
    fn parses_the_three_range_forms() {
        assert_eq!(range("bytes=0-9", 100), Some((0, 9)));
        assert_eq!(range("bytes=90-", 100), Some((90, 99)));
        assert_eq!(range("bytes=-10", 100), Some((90, 99)));
    }

    #[test]
    fn clamps_an_end_past_the_file() {
        assert_eq!(range("bytes=50-5000", 100), Some((50, 99)));
        assert_eq!(range("bytes=-5000", 100), Some((0, 99)));
    }

    #[test]
    fn rejects_unusable_ranges() {
        for spec in ["", "bytes=", "bytes=-", "bytes=a-b", "bytes=10-5", "bytes=100-", "bytes=0-1-2", "items=0-1"] {
            assert_eq!(range(spec, 100), None, "{spec}");
        }
    }

    #[test]
    fn an_empty_file_has_no_ranges() {
        assert_eq!(range("bytes=0-", 0), None);
        assert_eq!(range("bytes=-1", 0), None);
    }

    #[test]
    fn only_media_is_shown_inline() {
        for mime in ["image/png", "image/svg+xml", "video/mp4", "audio/mpeg", "image/png; q=1"] {
            assert!(is_inline_safe(mime), "{mime}");
        }
        for mime in ["text/html", "application/pdf", "application/javascript", "text/x-rust", "application/octet-stream", ""] {
            assert!(!is_inline_safe(mime), "{mime}");
        }
    }

    #[test]
    fn content_disposition_neutralises_hostile_names() {
        let header = content_disposition("a\"b\r\nX-Evil: 1.png", true);

        assert!(!header.contains('\r') && !header.contains('\n'));
        assert!(header.starts_with("attachment; filename=\"a_b__X-Evil_ 1.png\""), "{header}");
        assert!(HeaderValue::from_str(&header).is_ok());
    }

    #[test]
    fn content_disposition_keeps_the_real_name_for_non_ascii() {
        let header = content_disposition("отчёт.pdf", false);

        assert!(header.starts_with("inline; filename=\"_____.pdf\""), "{header}");
        assert!(header.contains("filename*=UTF-8''%D0%BE%D1%82%D1%87%D1%91%D1%82.pdf"), "{header}");
    }

    #[test]
    fn an_empty_name_falls_back_to_file() {
        assert!(content_disposition("  ", true).contains("filename=\"file\""));
    }

    async fn blob_with(content: &[u8], mime: &str) -> (Blob, std::path::PathBuf) {
        let path = std::env::temp_dir().join(format!("storage-serve-{}", Uuid::now_v7()));
        tokio::fs::write(&path, content).await.unwrap();
        let blob = Blob {
            id: Uuid::now_v7(),
            hash: "hash".into(),
            size: content.len() as i64,
            path: path.to_string_lossy().into_owned(),
            mime_type: mime.into(),
            created_at: Utc::now(),
        };
        (blob, path)
    }

    fn options() -> ServeOptions {
        ServeOptions {
            file_name: "data.bin".into(),
            force_download: false,
            cache_control: "private, max-age=60".into(),
        }
    }

    fn range_header(value: &str) -> HeaderMap {
        let mut headers = HeaderMap::new();
        headers.insert(header::RANGE, HeaderValue::from_str(value).unwrap());
        headers
    }

    #[tokio::test]
    async fn serves_the_whole_file_with_safe_headers() {
        let (blob, path) = blob_with(b"0123456789", "image/png").await;

        let (status, headers, body) = serve_blob(&blob, &HeaderMap::new(), options()).await.unwrap();

        assert_eq!(status, StatusCode::OK);
        assert_eq!(headers[header::CONTENT_LENGTH], "10");
        assert_eq!(headers[header::CONTENT_TYPE], "image/png");
        assert_eq!(headers[header::X_CONTENT_TYPE_OPTIONS], "nosniff");
        assert!(headers[header::CONTENT_SECURITY_POLICY].to_str().unwrap().contains("sandbox"));
        assert!(headers[header::CONTENT_DISPOSITION].to_str().unwrap().starts_with("inline"));
        assert_eq!(&to_bytes(body, usize::MAX).await.unwrap()[..], b"0123456789");
        let _ = tokio::fs::remove_file(path).await;
    }

    #[tokio::test]
    async fn serves_just_the_requested_window() {
        let (blob, path) = blob_with(b"0123456789", "video/mp4").await;

        let (status, headers, body) = serve_blob(&blob, &range_header("bytes=2-5"), options())
            .await
            .unwrap();

        assert_eq!(status, StatusCode::PARTIAL_CONTENT);
        assert_eq!(headers[header::CONTENT_RANGE], "bytes 2-5/10");
        assert_eq!(headers[header::CONTENT_LENGTH], "4");
        assert_eq!(&to_bytes(body, usize::MAX).await.unwrap()[..], b"2345");
        let _ = tokio::fs::remove_file(path).await;
    }

    #[tokio::test]
    async fn an_open_ended_range_streams_to_the_end() {
        let (blob, path) = blob_with(b"0123456789", "video/mp4").await;

        let (_, headers, body) = serve_blob(&blob, &range_header("bytes=7-"), options())
            .await
            .unwrap();

        assert_eq!(headers[header::CONTENT_RANGE], "bytes 7-9/10");
        assert_eq!(&to_bytes(body, usize::MAX).await.unwrap()[..], b"789");
        let _ = tokio::fs::remove_file(path).await;
    }

    #[tokio::test]
    async fn active_content_is_a_download_even_if_inline_was_not_forced_off() {
        let (blob, path) = blob_with(b"<script>alert(1)</script>", "text/html").await;

        let (_, headers, _) = serve_blob(&blob, &HeaderMap::new(), options()).await.unwrap();

        assert!(headers[header::CONTENT_DISPOSITION].to_str().unwrap().starts_with("attachment"));
        let _ = tokio::fs::remove_file(path).await;
    }

    #[tokio::test]
    async fn download_can_be_forced_for_media_too() {
        let (blob, path) = blob_with(b"x", "image/png").await;
        let forced = ServeOptions {
            force_download: true,
            ..options()
        };

        let (_, headers, _) = serve_blob(&blob, &HeaderMap::new(), forced).await.unwrap();

        assert!(headers[header::CONTENT_DISPOSITION].to_str().unwrap().starts_with("attachment"));
        let _ = tokio::fs::remove_file(path).await;
    }

    #[tokio::test]
    async fn an_empty_file_is_served_without_panicking() {
        let (blob, path) = blob_with(b"", "image/png").await;

        let (status, headers, body) = serve_blob(&blob, &range_header("bytes=0-"), options())
            .await
            .unwrap();

        assert_eq!(status, StatusCode::OK);
        assert_eq!(headers[header::CONTENT_LENGTH], "0");
        assert!(to_bytes(body, usize::MAX).await.unwrap().is_empty());
        let _ = tokio::fs::remove_file(path).await;
    }

    #[tokio::test]
    async fn a_missing_file_is_not_found() {
        let (blob, path) = blob_with(b"x", "image/png").await;
        tokio::fs::remove_file(&path).await.unwrap();

        let error = serve_blob(&blob, &HeaderMap::new(), options()).await.unwrap_err();

        assert_eq!(error.code(), &ErrorCode::NotFound);
    }
}
