use utoipa::Modify;
use utoipa::openapi::security::{Http, HttpAuthScheme, SecurityScheme};

pub struct SecurityAddon;

impl Modify for SecurityAddon {
    fn modify(&self, openapi: &mut utoipa::openapi::OpenApi) {
        if let Some(components) = &mut openapi.components {
            components.add_security_scheme(
                "bearer_auth",
                SecurityScheme::Http(Http::new(HttpAuthScheme::Bearer)),
            )
        }
    }
}
