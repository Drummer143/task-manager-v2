use utils::swagger::SecurityAddon;

#[derive(utoipa::OpenApi)]
#[openapi(
    paths(
        crate::entities::files::controller::get_file::get_signed_file,
        crate::entities::files::controller::get_file::get_public_file,
        crate::entities::files::controller::issue_links::issue_links,

        crate::entities::actions::controller::upload_init::upload_init,
        crate::entities::actions::controller::upload_verify::upload_verify,
        crate::entities::actions::controller::upload_chunk::upload_chunk,
        crate::entities::actions::controller::upload_status::upload_status,
        crate::entities::actions::controller::upload_cancel::upload_cancel,
        crate::entities::actions::controller::upload_complete::upload_complete,
        crate::entities::actions::controller::upload_whole_file::upload_whole_file,
    ),
    components(schemas(
        error_handlers::ErrorBody,
        error_handlers::ErrorCode,
        error_handlers::FieldError,
    )),
    security(
        ("bearer_auth" = [])
    ),
    modifiers(&SecurityAddon)
)]
pub struct ApiDoc;
