defmodule SocketServer.Notifications.ConsumerTest do
  use ExUnit.Case, async: true

  alias Broadway.Message
  alias Phoenix.Socket.Broadcast
  alias SocketServer.Notifications.Consumer

  defp user_id, do: "user-#{System.unique_integer([:positive])}"

  defp message(data) do
    %Message{data: data, acknowledger: Broadway.NoopAcknowledger.init()}
  end

  # What main_service publishes (signals.rs, the envelope test there pins the same shape)
  defp envelope(user_id) do
    Jason.encode!(%{
      "user_id" => user_id,
      "event" => "new_notification",
      "payload" => %{"kind" => "debug", "facts" => %{"message" => "hello"}}
    })
  end

  test "sends the payload to the user's topic under the event's name" do
    me = user_id()
    SocketServerWeb.Endpoint.subscribe("user:" <> me)

    result = Consumer.handle_message(:default, message(envelope(me)), %{})

    assert result.status == :ok
    assert_receive %Broadcast{topic: topic, event: "new_notification", payload: payload}
    assert topic == "user:" <> me
    assert payload == %{"kind" => "debug", "facts" => %{"message" => "hello"}}
  end

  test "fails a message that is not JSON or lacks a field, and sends nothing" do
    me = user_id()
    SocketServerWeb.Endpoint.subscribe("user:" <> me)

    for data <- [
          "not json",
          Jason.encode!(%{"user_id" => me, "event" => "new_notification"}),
          Jason.encode!(%{"event" => "new_notification", "payload" => %{}})
        ] do
      result = Consumer.handle_message(:default, message(data), %{})
      assert result.status == {:failed, :invalid_payload}
    end

    refute_receive %Broadcast{}
  end
end
