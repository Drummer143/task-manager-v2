//! OpenAPI helpers: reusable error responses and a machine-readable catalog of error codes.
//!
//! Register `ErrorBody`, `ErrorCode` and `FieldError` in the `components(schemas(...))` of the
//! service's `#[derive(OpenApi)]`; the responses built here reference them by name.

use std::collections::{BTreeMap, HashMap};

use serde::Serialize;
use serde_json::{Value, json};
use utoipa::{
    PartialSchema,
    openapi::{
        Ref, RefOr,
        content::ContentBuilder,
        example::ExampleBuilder,
        header::HeaderBuilder,
        response::{Response, ResponseBuilder},
        schema::{Object, Type},
    },
};

use crate::{ApiError, ErrorCode, FieldError};

const PROBLEM_JSON: &str = "application/problem+json";

/// Descriptions come from the doc comments on [`ErrorCode`] variants, read back from its schema,
/// so the text is written once.
fn descriptions() -> HashMap<String, String> {
    let schema = serde_json::to_value(ErrorCode::schema()).unwrap_or(Value::Null);
    let variants = schema["oneOf"].as_array().cloned().unwrap_or_default();

    variants
        .iter()
        .filter_map(|variant| {
            let code = variant["properties"]["code"]["enum"][0].as_str()?;
            let description = variant["description"].as_str()?;
            Some((code.to_owned(), description.to_owned()))
        })
        .collect()
}

fn describe(code: &ErrorCode) -> String {
    descriptions().remove(code.as_str()).unwrap_or_default()
}

/// A realistic response body for `code`, used as the documented example.
fn example_body(code: &ErrorCode) -> Value {
    let error = match code {
        ErrorCode::ValidationFailed => {
            ApiError::validation(vec![FieldError::new("avatar", ErrorCode::Required)])
        }
        other => ApiError::new(other.clone()),
    };
    serde_json::to_value(error.to_body()).unwrap_or_else(|_| json!({}))
}

/// Documents the `X-Request-Id` header set by [`crate::trace::request_id`]; its value is the
/// `trace_id` of the error body.
fn request_id_header() -> utoipa::openapi::header::Header {
    HeaderBuilder::new()
        .schema(Some(Object::with_type(Type::String)))
        .description(Some(
            "Request id, equal to `trace_id` in the body. Quote it when reporting a problem.",
        ))
        .build()
}

/// Builds OpenAPI responses for the given codes, one response per HTTP status.
///
/// Codes sharing a status become named examples of the same response. Use this in domain crates
/// to declare their own sets, e.g. `responses_for(&[ErrorCode::FileTooLarge { .. }])`.
pub fn responses_for(codes: &[ErrorCode]) -> BTreeMap<String, RefOr<Response>> {
    let mut by_status: BTreeMap<u16, Vec<&ErrorCode>> = BTreeMap::new();
    for code in codes {
        by_status.entry(code.status()).or_default().push(code);
    }

    by_status
        .into_iter()
        .map(|(status, codes)| {
            let description = match codes.as_slice() {
                [only] => format!("`{}`: {}", only.as_str(), describe(only)),
                many => format!(
                    "One of: {}",
                    many.iter()
                        .map(|c| format!("`{}`", c.as_str()))
                        .collect::<Vec<_>>()
                        .join(", ")
                ),
            };

            let examples = codes.iter().map(|code| {
                let example = ExampleBuilder::new()
                    .summary(describe(code))
                    .value(Some(example_body(code)))
                    .build();
                (code.as_str().to_owned(), example)
            });

            let content = ContentBuilder::new()
                .schema(Some(Ref::from_schema_name("ErrorBody")))
                .examples_from_iter(examples)
                .build();

            let response = ResponseBuilder::new()
                .description(description)
                .content(PROBLEM_JSON, content)
                .header("X-Request-Id", request_id_header())
                .build();

            (status.to_string(), RefOr::T(response))
        })
        .collect()
}

/// Re-exports the macro below relies on, so callers do not need to import them.
#[doc(hidden)]
pub mod __private {
    pub use std::collections::BTreeMap;
    pub use utoipa::{
        IntoResponses,
        openapi::{RefOr, response::Response},
    };
}

/// Declares a unit struct implementing `utoipa::IntoResponses` for a list of codes, for use in
/// `#[utoipa::path(responses(.., MyErrors))]`.
///
/// ```ignore
/// error_handlers::error_set!(
///     /// What the upload endpoint can return.
///     pub UploadErrors => [ErrorCode::Unauthorized, ErrorCode::FileTooLarge { max_bytes: 1, actual_bytes: 2 }]
/// );
/// ```
#[macro_export]
macro_rules! error_set {
    ($(#[$meta:meta])* $vis:vis $name:ident => [$($code:expr),+ $(,)?]) => {
        $(#[$meta])*
        $vis struct $name;

        impl $crate::openapi::__private::IntoResponses for $name {
            fn responses() -> $crate::openapi::__private::BTreeMap<
                String,
                $crate::openapi::__private::RefOr<$crate::openapi::__private::Response>,
            > {
                $crate::openapi::responses_for(&[$($code),+])
            }
        }
    };
}

error_set!(
    /// `401`, `403`, `500` and `504`: what any authenticated endpoint can return.
    pub CommonErrors => [
        ErrorCode::Unauthorized,
        ErrorCode::Forbidden,
        ErrorCode::Internal,
        ErrorCode::Timeout
    ]
);
error_set!(
    /// `400`, `413` and `415`: what an endpoint with a JSON body can return before the handler runs.
    ///
    /// Responses are keyed by status, so an endpoint that also documents another `413` code
    /// (e.g. `FILE_TOO_LARGE`) must declare both in one [`responses_for`] call instead.
    pub RequestErrors => [
        ErrorCode::MalformedRequest,
        ErrorCode::UnsupportedMediaType,
        ErrorCode::PayloadTooLarge
    ]
);
error_set!(
    /// `422 VALIDATION_FAILED` with per-field errors.
    pub ValidationErrors => [ErrorCode::ValidationFailed]
);
error_set!(
    /// `404 NOT_FOUND`.
    pub NotFoundError => [ErrorCode::NotFound]
);
error_set!(
    /// `409 CONFLICT`.
    pub ConflictError => [ErrorCode::Conflict]
);

/// One row of the error code catalog.
#[derive(Debug, Serialize)]
pub struct CatalogEntry {
    pub code: &'static str,
    pub status: u16,
    #[serde(rename = "type")]
    pub problem_type: String,
    pub description: String,
    /// Names of the `params` keys the client can interpolate into its translation.
    pub params: Vec<String>,
    pub example: Value,
}

/// Every error code with status, params and description.
///
/// Export it (see `examples/error_codes.rs`) as the contract for client translations.
pub fn catalog() -> Vec<CatalogEntry> {
    let descriptions = descriptions();

    ErrorCode::examples()
        .iter()
        .map(|code| {
            let example = example_body(code);
            let params = example["params"]
                .as_object()
                .map(|params| params.keys().cloned().collect())
                .unwrap_or_default();

            CatalogEntry {
                code: code.as_str(),
                status: code.status(),
                problem_type: code.problem_type(),
                description: descriptions.get(code.as_str()).cloned().unwrap_or_default(),
                params,
                example,
            }
        })
        .collect()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn every_code_is_documented() {
        for code in ErrorCode::examples() {
            assert!(
                !describe(&code).trim().is_empty(),
                "{} has no doc comment",
                code.as_str()
            );
        }
    }

    #[test]
    fn examples_cover_every_variant() {
        let schema = serde_json::to_value(ErrorCode::schema()).unwrap();
        let variants = schema["oneOf"].as_array().unwrap().len();
        assert_eq!(
            ErrorCode::examples().len(),
            variants,
            "add the new variant to ErrorCode::examples()"
        );
    }

    #[test]
    fn groups_codes_by_status() {
        let responses = responses_for(&[
            ErrorCode::NotFound,
            ErrorCode::Conflict,
            ErrorCode::Required,
            ErrorCode::ValidationFailed,
        ]);
        let statuses: Vec<_> = responses.keys().map(String::as_str).collect();
        assert_eq!(statuses, ["404", "409", "422"]);

        let json = serde_json::to_value(&responses["422"]).unwrap();
        assert!(json["headers"]["X-Request-Id"].is_object());
        let examples = &json["content"][PROBLEM_JSON]["examples"];
        assert!(examples["REQUIRED"].is_object());
        assert!(examples["VALIDATION_FAILED"].is_object());
    }

    #[test]
    fn catalog_lists_params() {
        let catalog = catalog();
        let entry = catalog
            .iter()
            .find(|entry| entry.code == "FILE_TOO_LARGE")
            .unwrap();
        assert_eq!(entry.status, 413);
        assert_eq!(entry.params, ["actual_bytes", "max_bytes"]);
    }
}
