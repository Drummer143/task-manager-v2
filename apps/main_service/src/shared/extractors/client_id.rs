use std::convert::Infallible;

use axum::{extract::FromRequestParts, http::request::Parts};
use uuid::Uuid;

/// The header each tab sends its id in (`shared/realtime/clientId.ts`).
pub const CLIENT_ID_HEADER: &str = "x-client-id";

/// The id of the tab that sent the request, from `X-Client-Id`: the `origin` of the signals the
/// request causes. Missing or not a uuid: `None`, and every tab takes the signal.
#[derive(Debug, Clone, Copy, Default)]
pub struct ClientId(pub Option<Uuid>);

impl<S: Send + Sync> FromRequestParts<S> for ClientId {
    type Rejection = Infallible;

    async fn from_request_parts(parts: &mut Parts, _state: &S) -> Result<Self, Self::Rejection> {
        let id = parts
            .headers
            .get(CLIENT_ID_HEADER)
            .and_then(|value| value.to_str().ok())
            .and_then(|value| Uuid::parse_str(value).ok());

        Ok(Self(id))
    }
}

#[cfg(test)]
mod tests {
    use axum::http::Request;

    use super::*;

    async fn client_id(header: Option<&str>) -> Option<Uuid> {
        let mut request = Request::builder();
        if let Some(value) = header {
            request = request.header("X-Client-Id", value);
        }
        let (mut parts, ()) = request.body(()).unwrap().into_parts();

        let Ok(ClientId(id)) = ClientId::from_request_parts(&mut parts, &()).await;
        id
    }

    #[tokio::test]
    async fn reads_the_tab_id_and_ignores_anything_else() {
        let id = Uuid::now_v7();

        assert_eq!(client_id(Some(&id.to_string())).await, Some(id));
        assert_eq!(client_id(Some("not a uuid")).await, None);
        assert_eq!(client_id(None).await, None);
    }
}
