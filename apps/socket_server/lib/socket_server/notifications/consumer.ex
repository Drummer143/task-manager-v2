defmodule SocketServer.Notifications.Consumer do
  use Broadway

  alias Broadway.Message

  @exchange "notifications"
  @queue "socket_server.notifications"

  def start_link(_opts) do
    Broadway.start_link(__MODULE__,
      name: __MODULE__,
      producer: [
        module: {
          BroadwayRabbitMQ.Producer,
          connection: Application.fetch_env!(:socket_server, :amqp_url),
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

  # main publishes with the user id as the routing key (`metadata: [:routing_key]` above
  # brings it here): one user's signals go through one processor and keep their order
  defp partition(%Message{metadata: %{routing_key: user_id}}), do: :erlang.phash2(user_id)

  @impl true
  def handle_message(_processor, %Message{data: data} = message, _context) do
    case Jason.decode(data) do
      {:ok, %{"user_id" => user_id, "event" => event, "payload" => payload}} ->
        SocketServerWeb.Endpoint.broadcast("user:" <> user_id, event, payload)
        message

      _ ->
        Message.failed(message, :invalid_payload)
    end
  end
end
