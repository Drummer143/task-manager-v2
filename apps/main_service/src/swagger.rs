use utils::swagger::SecurityAddon;

use crate::notifications::controllers;

/// The API the frontend calls. Webhooks are left out: authentik calls them, not the browser.
#[derive(utoipa::OpenApi)]
#[openapi(
    paths(
        crate::me::me,

        controllers::get_list::get_list,
        controllers::get_account_list::get_account_list,
        controllers::summary::get_summary,
        controllers::create::create,
        controllers::read::read_notification,
        controllers::read_all::read_all_notifications,
        controllers::unread::unread_notification,
        controllers::archive::archive_notification,
        controllers::unarchive::unarchive_notification,
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
