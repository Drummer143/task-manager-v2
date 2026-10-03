use lapin::{
    BasicProperties, Channel, ExchangeKind,
    options::{BasicPublishOptions, ExchangeDeclareOptions},
    types::FieldTable,
};
use serde::Serialize;
use uuid::Uuid;

#[derive(Serialize)]
struct Envelope<'a, T: Serialize> {
    user_id: Uuid,
    event: &'a str,
    payload: &'a T,
}

const NOTIFICATIONS_EXCHANGE: &str = "notifications";

#[derive(Clone)]
pub struct Signals {
    channel: Channel,
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

        Ok(Self { channel })
    }

    pub async fn publish(&self, user_id: Uuid, event: &str, payload: &impl Serialize) {
        if let Err(error) = self.try_publish(user_id, event, payload).await {
            tracing::warn!(%user_id, event, %error, "signal dropped");
        }
    }

    async fn try_publish(
        &self,
        user_id: Uuid,
        event: &str,
        payload: &impl Serialize,
    ) -> anyhow::Result<()> {
        let body = serde_json::to_vec(&Envelope {
            user_id,
            event,
            payload,
        })?;
        self.channel
            .basic_publish(
                NOTIFICATIONS_EXCHANGE.into(),
                user_id.to_string().into(),
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
            user_id,
            event: "new_notification",
            payload: &payload,
        })
        .unwrap();

        assert_eq!(
            envelope,
            json!({
                "user_id": "00000000-0000-0000-0000-000000000000",
                "event": "new_notification",
                "payload": { "kind": "debug", "facts": { "message": "hello" } },
            })
        );
    }
}
