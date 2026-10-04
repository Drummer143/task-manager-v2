defmodule SocketService.SocketTest do
  use SocketService.ChannelCase, async: true

  test "refuses a connection without a token" do
    assert connect(SocketService.Socket, %{}) == {:error, :unauthorized}
  end

  test "identifies a connection by its user" do
    socket = socket(SocketService.Socket, nil, %{user_id: "user-1"})

    assert SocketService.Socket.id(socket) == "socket:user-1"
  end
end
