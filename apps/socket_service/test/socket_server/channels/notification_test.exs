defmodule SocketService.Channels.NotificationTest do
  use SocketService.ChannelCase, async: true

  alias SocketService.Channels.Notification

  # PubSub topics are global: a fresh user per test keeps async tests apart
  defp user_id, do: "user-#{System.unique_integer([:positive])}"

  defp join(user_id) do
    {:ok, _reply, socket} =
      SocketService.Socket
      |> socket("socket:#{user_id}", %{user_id: user_id})
      |> subscribe_and_join(Notification, "notifications")

    socket
  end

  test "pushes to the client what is sent to its user" do
    me = user_id()
    join(me)

    SocketServiceWeb.Endpoint.broadcast("user:" <> me, "new_notification", %{"kind" => "debug"})

    assert_push "new_notification", %{"kind" => "debug"}
  end

  test "does not push what is sent to someone else" do
    join(user_id())

    SocketServiceWeb.Endpoint.broadcast("user:" <> user_id(), "new_notification", %{})

    refute_push "new_notification", _
  end

  test "stops pushing after the client leaves" do
    me = user_id()
    socket = join(me)
    Process.unlink(socket.channel_pid)

    ref = leave(socket)
    assert_reply ref, :ok

    SocketServiceWeb.Endpoint.broadcast("user:" <> me, "new_notification", %{})
    refute_push "new_notification", _
  end
end
