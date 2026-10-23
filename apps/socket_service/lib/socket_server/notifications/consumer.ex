defmodule SocketService.Notifications.Consumer do
  use Broadway

  alias Broadway.Message

  @exchange "notifications"
  @queue "socket_service.notifications"

  def start_link(_opts) do
    Broadway.start_link(__MODULE__,
      name: __MODULE__,
      producer: [
        module: {
          BroadwayRabbitMQ.Producer,
          connection: Application.fetch_env!(:socket_service, :amqp_url),
          queue: @queue,
          declare: [durable: true, arguments: [{"x-message-ttl", :long, 60_000}]],
          after_connect: &declare_exchange/1,
          bindings: [{@exchange, []}],
          on_failure: :reject,
          qos: [prefetch_count: 50],
          metadata: [:routing_key]
        },
        concurrency: 1
      ],
      processors: [default: [concurrency: 4]],
      partition_by: &partition/1
    )
  end

  defp declare_exchange(channel),
    do: AMQP.Exchange.declare(channel, @exchange, :fanout, durable: true)

  # main publishes with the topic as the routing key (`metadata: [:routing_key]` above brings
  # it here): one topic's signals go through one processor and keep their order
  defp partition(%Message{metadata: %{routing_key: topic}}), do: :erlang.phash2(topic)

  # The envelope of main (signals.rs): `topic` is `user:{id}`, which the channel `notifications`
  # of each of the user's tabs listens to, or `workspace:{id}`, the workspace's channel itself
  @impl true
  def handle_message(_processor, %Message{data: data} = message, _context) do
    case Jason.decode(data) do
      {:ok, %{"topic" => topic, "event" => event, "payload" => payload}}
      when is_binary(event) ->
        if allowed_topic?(topic) do
          SocketServiceWeb.Endpoint.broadcast(topic, event, payload)
          message
        else
          Message.failed(message, :invalid_topic)
        end

      _ ->
        Message.failed(message, :invalid_payload)
    end
  end

  defp allowed_topic?("user:" <> id) when id != "", do: true
  defp allowed_topic?("workspace:" <> id) when id != "", do: true
  defp allowed_topic?(_topic), do: false
end
