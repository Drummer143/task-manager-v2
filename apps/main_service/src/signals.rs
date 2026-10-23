use lapin::{
    BasicProperties, Channel, ExchangeKind,
    options::{BasicPublishOptions, ExchangeDeclareOptions},
    types::FieldTable,
};
use serde::Serialize;
use uuid::Uuid;

/// What the socket server's consumer reads (consumer.ex): it broadcasts `payload` to the PubSub
/// `topic` under the name `event`.
#[derive(Serialize)]
struct Envelope<'a, T: Serialize> {
    topic: &'a str,
    event: &'a str,
    payload: &'a T,
}

/// The PubSub topic of a user: the channel `notifications` of each of their tabs listens to it.
pub fn user_topic(user_id: Uuid) -> String {
    format!("user:{user_id}")
}

/// The PubSub topic of a workspace: the channel `workspace:{id}` itself, joined by its members.
pub fn workspace_topic(workspace_id: Uuid) -> String {
    format!("workspace:{workspace_id}")
}

const NOTIFICATIONS_EXCHANGE: &str = "notifications";

#[derive(Clone)]
pub struct Signals {
    sink: Sink,
}

#[derive(Clone)]
enum Sink {
    Amqp(Channel),
    /// Keeps what is sent, for the tests to look at, instead of sending it.
    #[cfg(test)]
    Recorded(std::sync::Arc<std::sync::Mutex<Vec<Sent>>>),
}

/// A signal as it was sent, with its payload as JSON.
#[cfg(test)]
#[derive(Debug, Clone, PartialEq)]
pub struct Sent {
    pub topic: String,
    pub event: String,
    pub payload: serde_json::Value,
}

impl Signals {
    pub async fn new(conn: &lapin::Connection) -> lapin::Result<Self> {
        let channel = conn.create_channel().await?;

        channel
            .exchange_declare(
                NOTIFICATIONS_EXCHANGE.into(),
                ExchangeKind::Fanout,
                ExchangeDeclareOptions {
                    durable: true,
                    ..Default::default()
                },
                FieldTable::default(),
            )
            .await?;

        Ok(Self {
            sink: Sink::Amqp(channel),
        })
    }

    /// Signals that are kept, not sent: `sent()` returns them.
    #[cfg(test)]
    pub fn recorded() -> Self {
        Self {
            sink: Sink::Recorded(Default::default()),
        }
    }

    /// What was sent so far, in order. Only for `recorded()`.
    #[cfg(test)]
    pub fn sent(&self) -> Vec<Sent> {
        match &self.sink {
            Sink::Recorded(sent) => sent.lock().unwrap().clone(),
            Sink::Amqp(_) => panic!("only recorded signals can be read back"),
        }
    }

    /// To every tab of the user.
    pub async fn publish(&self, user_id: Uuid, event: &str, payload: &impl Serialize) {
        self.publish_to(&user_topic(user_id), event, payload).await;
    }

    /// To every tab that has the workspace's channel joined.
    pub async fn publish_to_workspace(
        &self,
        workspace_id: Uuid,
        event: &str,
        payload: &impl Serialize,
    ) {
        self.publish_to(&workspace_topic(workspace_id), event, payload)
            .await;
    }

    /// Best effort: the change is done already, so a failure is logged, never the request's error.
    async fn publish_to(&self, topic: &str, event: &str, payload: &impl Serialize) {
        if let Err(error) = self.try_publish(topic, event, payload).await {
            tracing::warn!(topic, event, %error, "signal dropped");
        }
    }

    async fn try_publish(
        &self,
        topic: &str,
        event: &str,
        payload: &impl Serialize,
    ) -> anyhow::Result<()> {
        // Outside tests the sink is always AMQP, and the match has one arm
        #[cfg_attr(not(test), allow(clippy::infallible_destructuring_match))]
        let channel = match &self.sink {
            Sink::Amqp(channel) => channel,
            #[cfg(test)]
            Sink::Recorded(sent) => {
                sent.lock().unwrap().push(Sent {
                    topic: topic.to_owned(),
                    event: event.to_owned(),
                    payload: serde_json::to_value(payload)?,
                });
                return Ok(());
            }
        };

        let body = serde_json::to_vec(&Envelope {
            topic,
            event,
            payload,
        })?;
        // The topic is the routing key: the consumer keeps one topic's signals in order by it
        channel
            .basic_publish(
                NOTIFICATIONS_EXCHANGE.into(),
                topic.into(),
                BasicPublishOptions::default(),
                &body,
                BasicProperties::default()
                    .with_content_type("application/json".into())
                    .with_delivery_mode(1),
            )
            .await?;
        Ok(())
    }
}

#[cfg(test)]
mod tests {
    use serde_json::json;

    use super::*;

    // The socket server's consumer matches on exactly these keys (consumer.ex, handle_message)
    #[test]
    fn the_envelope_is_what_the_socket_server_consumer_reads() {
        let user_id = Uuid::nil();
        let payload = json!({ "kind": "debug", "facts": { "message": "hello" } });

        let envelope = serde_json::to_value(Envelope {
            topic: &user_topic(user_id),
            event: "inbox.updated",
            payload: &payload,
        })
        .unwrap();

        assert_eq!(
            envelope,
            json!({
                "topic": "user:00000000-0000-0000-0000-000000000000",
                "event": "inbox.updated",
                "payload": { "kind": "debug", "facts": { "message": "hello" } },
            })
        );
    }
}
