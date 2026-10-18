defmodule SocketService.Notifications.ConsumerTest do
  use ExUnit.Case, async: true

  alias Broadway.Message
  alias Phoenix.Socket.Broadcast
  alias SocketService.Notifications.Consumer

  defp unique(prefix), do: "#{prefix}-#{System.unique_integer([:positive])}"

  defp message(data) do
    %Message{data: data, acknowledger: Broadway.NoopAcknowledger.init()}
  end

  # What main_service publishes (signals.rs, the envelope test there pins the same shape)
  defp envelope(topic) do
    Jason.encode!(%{
      "topic" => topic,
      "event" => "inbox.updated",
      "payload" => %{"kind" => "debug", "facts" => %{"message" => "hello"}}
    })
  end

  test "sends the payload to a user's topic under the event's name" do
    topic = "user:" <> unique("user")
    SocketServiceWeb.Endpoint.subscribe(topic)

    result = Consumer.handle_message(:default, message(envelope(topic)), %{})

    assert result.status == :ok
    assert_receive %Broadcast{topic: ^topic, event: "inbox.updated", payload: payload}
    assert payload == %{"kind" => "debug", "facts" => %{"message" => "hello"}}
  end

  test "sends to a workspace's topic too" do
    topic = "workspace:" <> unique("workspace")
    SocketServiceWeb.Endpoint.subscribe(topic)

    result = Consumer.handle_message(:default, message(envelope(topic)), %{})

    assert result.status == :ok
    assert_receive %Broadcast{topic: ^topic, event: "inbox.updated"}
  end

  test "fails a topic that is neither a user's nor a workspace's, and sends nothing" do
    for topic <- ["phoenix", "user:", "chat:" <> unique("room")] do
      SocketServiceWeb.Endpoint.subscribe(topic)

      result = Consumer.handle_message(:default, message(envelope(topic)), %{})
      assert result.status == {:failed, :invalid_topic}
    end

    refute_receive %Broadcast{}
  end

  test "fails a message that is not JSON or lacks a field, and sends nothing" do
    topic = "user:" <> unique("user")
    SocketServiceWeb.Endpoint.subscribe(topic)

    for data <- [
          "not json",
          Jason.encode!(%{"topic" => topic, "event" => "inbox.updated"}),
          Jason.encode!(%{"event" => "inbox.updated", "payload" => %{}}),
          # The envelope before topics: a message still queued from an older main
          Jason.encode!(%{"user_id" => unique("user"), "event" => "x", "payload" => %{}})
        ] do
      result = Consumer.handle_message(:default, message(data), %{})
      assert result.status == {:failed, :invalid_payload}
    end

    refute_receive %Broadcast{}
  end
end
