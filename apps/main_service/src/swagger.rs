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
        crate::workspaces::controllers::get_me_in_workspace::get_me_in_workspace,
        crate::workspaces::controllers::patch_workspace::patch_workspace,
        crate::workspaces::controllers::resolve_slug::resolve_slug,
        crate::workspaces::controllers::check_slug_available::check_slug_available,
        crate::workspaces::controllers::stats::get_stats,
        crate::workspaces::controllers::soft_delete_workspace::soft_delete_workspace,
        crate::workspaces::controllers::restore_workspace::restore_workspace,

        crate::pages::controllers::get_tree::get_tree,
        crate::pages::controllers::create_page::create_page,
        crate::pages::controllers::get_page_by_short_id::get_page_by_short_id,
        crate::pages::controllers::patch_page::patch_page,
        crate::pages::controllers::move_page::move_page,
        crate::pages::controllers::delete_page::delete_page,
        crate::pages::controllers::restore_page::restore_page,
    ),
    components(schemas(
        error_handlers::ErrorBody,
        error_handlers::ErrorCode,
        error_handlers::EditedField,
        error_handlers::FieldError,
        crate::notifications::updates::InboxUpdated,
    )),
    security(
        ("bearer_auth" = [])
    ),
    modifiers(&SecurityAddon)
)]
pub struct ApiDoc;
