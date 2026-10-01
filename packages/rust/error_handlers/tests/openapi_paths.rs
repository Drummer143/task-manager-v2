#![cfg(feature = "openapi")]

use error_handlers::{
    ErrorBody, ErrorCode, FieldError,
    openapi::{CommonErrors, NotFoundError, ValidationErrors},
};
use utoipa::OpenApi;

// Domain-specific set declared next to the handler that needs it.
error_handlers::error_set!(
    UploadErrors => [ErrorCode::FileTooLarge { max_bytes: 5_242_880, actual_bytes: 9_437_184 }]
);

#[utoipa::path(
    put,
    path = "/users/{id}/avatar",
    responses(
        (status = 204, description = "Avatar updated"),
        CommonErrors,
        NotFoundError,
        ValidationErrors,
        UploadErrors,
    )
)]
#[allow(dead_code)]
fn upload_avatar() {}

#[derive(OpenApi)]
#[openapi(
    paths(upload_avatar),
    components(schemas(ErrorBody, ErrorCode, FieldError))
)]
struct Doc;

#[test]
fn path_lists_every_error_status_with_problem_json() {
    let spec = serde_json::to_value(Doc::openapi()).unwrap();
    let responses = &spec["paths"]["/users/{id}/avatar"]["put"]["responses"];

    for status in ["204", "401", "403", "404", "413", "422", "500"] {
        assert!(responses[status].is_object(), "missing {status}");
    }
    let too_large = &responses["413"]["content"]["application/problem+json"];
    assert_eq!(
        too_large["schema"]["$ref"],
        "#/components/schemas/ErrorBody"
    );
    assert_eq!(
        too_large["examples"]["FILE_TOO_LARGE"]["value"]["params"]["max_bytes"],
        5_242_880
    );
}
