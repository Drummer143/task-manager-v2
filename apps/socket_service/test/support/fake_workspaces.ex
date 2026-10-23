defmodule SocketService.FakeWorkspaces do
  @moduledoc """
  SocketService.Workspaces for the channel tests: a member is who `add_member/2` added. The
  table is public, as the channel's process asks it, not the test's.
  """

  @behaviour SocketService.Workspaces

  @table __MODULE__

  def start, do: :ets.new(@table, [:named_table, :public, :set])

  def add_member(user_id, workspace_id), do: :ets.insert(@table, {{user_id, workspace_id}})

  @impl true
  def member?(user_id, workspace_id), do: :ets.member(@table, {user_id, workspace_id})
end
