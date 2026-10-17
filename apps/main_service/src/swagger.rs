use utils::swagger::SecurityAddon;

/// The API the frontend calls. Webhooks and `/internal/*` are left out: authentik and the other
/// services call them, not the browser.
#[derive(utoipa::OpenApi)]
#[openapi(
    paths(
        crate::me::me,

        crate::assets::controllers::create::create_asset,

        crate::notifications::controllers::get_list::get_list,
        crate::notifications::controllers::get_account_list::get_account_list,
        crate::notifications::controllers::summary::get_summary,
        crate::notifications::controllers::create::create,
        crate::notifications::controllers::read::read_notification,
        crate::notifications::controllers::read_all::read_all_notifications,
        crate::notifications::controllers::unread::unread_notification,
        crate::notifications::controllers::archive::archive_notification,
        crate::notifications::controllers::unarchive::unarchive_notification,

        crate::workspaces::controllers::create::create_workspace,
        crate::workspaces::controllers::get_user_workspaces::get_user_workspaces,
        crate::workspaces::controllers::get_workspace_by_id::get_workspace_by_id,
        crate::workspaces::controllers::resolve_slug::resolve_slug,
    ),
    components(schemas(
        error_handlers::ErrorBody,
        error_handlers::ErrorCode,
        error_handlers::FieldError,
        crate::notifications::updates::InboxUpdated,
    )),
    security(
        ("bearer_auth" = [])
    ),
    modifiers(&SecurityAddon)
)]
pub struct ApiDoc;
