defmodule SocketService.Socket do
  require Logger
  use Phoenix.Socket

  channel "notifications", SocketService.Channels.Notification

  def connect(%{"token" => token}, socket, _connect_info) do
    case SocketService.AuthVerifier.Token.verify_and_validate(token) do
      {:ok, claims} ->
        sub = claims["sub"]

        {:ok, assign(socket, :user_id, sub)}

      {:error, reason} ->
        Logger.error("Invalid token: #{inspect(reason)}")
        :error
    end
  end

  def connect(_params, _socket, _connect_info) do
    {:error, :unauthorized}
  end

  def id(socket), do: "socket:#{socket.assigns.user_id}"
end
