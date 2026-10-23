defmodule SocketService.Channels.Workspace do
  @moduledoc """
  `workspace:{id}`: what happens in a workspace, for its members. main publishes to this very
  topic (the consumer broadcasts it), so Phoenix pushes it to the joined clients by itself.
  """

  use Phoenix.Channel

  def join("workspace:" <> workspace_id, _params, socket) do
    if workspaces().member?(socket.assigns.user_id, workspace_id) do
      {:ok, socket}
    else
      # Not a member, no such workspace, or not a uuid: all the same to the client
      {:error, %{reason: "not_found"}}
    end
  end

  # SocketService.Workspaces; tests put a fake in its place (config/test.exs)
  defp workspaces,
    do: Application.get_env(:socket_service, :workspaces, SocketService.Workspaces)
end
