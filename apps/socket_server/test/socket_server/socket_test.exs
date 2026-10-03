defmodule SocketServer.SocketTest do
  use SocketServer.ChannelCase, async: true

  test "refuses a connection without a token" do
    assert connect(SocketServer.Socket, %{}) == {:error, :unauthorized}
  end

  test "identifies a connection by its user" do
    socket = socket(SocketServer.Socket, nil, %{user_id: "user-1"})

    assert SocketServer.Socket.id(socket) == "socket:user-1"
  end
end
