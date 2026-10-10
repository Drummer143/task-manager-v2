//! main-service as a library: `main.rs` runs it, and `export-openapi-main` writes its OpenAPI
//! spec for the frontend's generated client (`nx run main_service:export-openapi`).

use utoipa::OpenApi;

pub mod app_state;
pub mod config;
pub mod me;
pub mod notifications;
pub mod repos;
pub mod signals;
pub mod swagger;
pub mod webhooks;
pub mod workspaces;

pub fn openapi_json() -> String {
    serde_json::to_string_pretty(&swagger::ApiDoc::openapi()).unwrap()
}
