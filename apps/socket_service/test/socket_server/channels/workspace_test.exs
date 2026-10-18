defmodule SocketService.Channels.WorkspaceTest do
  use SocketService.ChannelCase, async: true

  alias SocketService.Channels.Workspace
  alias SocketService.FakeWorkspaces

  # PubSub topics are global: fresh ids per test keep async tests apart
  defp unique(prefix), do: "#{prefix}-#{System.unique_integer([:positive])}"

  defp join_as(user_id, workspace_id) do
    SocketService.Socket
    |> socket("socket:#{user_id}", %{user_id: user_id})
    |> subscribe_and_join(Workspace, "workspace:" <> workspace_id)
  end

  test "a member joins and gets what is sent to the workspace" do
    me = unique("user")
    workspace = unique("workspace")
    FakeWorkspaces.add_member(me, workspace)

    assert {:ok, _reply, _socket} = join_as(me, workspace)

    SocketServiceWeb.Endpoint.broadcast("workspace:" <> workspace, "data.changed", %{
      "tags" => ["workspace:" <> workspace]
    })

    assert_push "data.changed", %{"tags" => ["workspace:" <> ^workspace]}
  end

  test "someone else may not join" do
    workspace = unique("workspace")
    FakeWorkspaces.add_member(unique("user"), workspace)

    assert {:error, %{reason: "not_found"}} = join_as(unique("user"), workspace)
  end

  test "a member of one workspace does not get another's" do
    me = unique("user")
    mine = unique("workspace")
    FakeWorkspaces.add_member(me, mine)
    {:ok, _reply, _socket} = join_as(me, mine)

    SocketServiceWeb.Endpoint.broadcast("workspace:" <> unique("workspace"), "data.changed", %{})

    refute_push "data.changed", _
  end
end
