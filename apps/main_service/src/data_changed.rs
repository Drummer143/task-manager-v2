//! `data.changed`: a signal that data has changed, without the data. The frontend fetches again
//! the queries carrying any of its `tags` (`shared/tags`; `shared/realtime` there). It goes to a
//! workspace's channel, which only its members may join, or to a user's own channel.
//!
//! Sent after the change is committed: sent earlier, a client could fetch the old data again.

use serde::Serialize;
use uuid::Uuid;

/// The socket event's name.
pub const DATA_CHANGED: &str = "data.changed";

#[derive(Debug, Serialize)]
pub struct DataChanged {
    /// What happened, for logs and debugging; the client acts on `tags` alone.
    #[serde(rename = "type")]
    pub kind: &'static str,
    pub tags: Vec<String>,
    /// The tab whose request made the change (`ClientId`): it has the new data already and skips
    /// the signal.
    pub origin: Option<Uuid>,
}

#[cfg(test)]
mod tests {
    use serde_json::json;

    use super::*;
    use crate::shared::tags;

    // The frontend reads these keys (`DataChanged` in app/socket/socket.ts)
    #[test]
    fn sends_type_tags_and_origin() {
        let signal = DataChanged {
            kind: "workspace.updated",
            tags: vec![tags::workspace(Uuid::nil())],
            origin: None,
        };

        assert_eq!(
            serde_json::to_value(signal).unwrap(),
            json!({
                "type": "workspace.updated",
                "tags": ["workspace:00000000-0000-0000-0000-000000000000"],
                "origin": null,
            })
        );
    }
}
