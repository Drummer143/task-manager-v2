defmodule SocketService.Channels.Notification do
  use Phoenix.Channel

  def join("notifications", _params, socket) do
    :ok = SocketServiceWeb.Endpoint.subscribe("user:" <> socket.assigns.user_id)
    {:ok, socket}
  end

  def handle_info(%Phoenix.Socket.Broadcast{event: event, payload: payload}, socket) do
    push(socket, event, payload)
    {:noreply, socket}
  end
end
