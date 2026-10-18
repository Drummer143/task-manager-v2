defmodule SocketService.Workspaces do
  @moduledoc """
  Workspaces, read from main's tables: main owns and migrates them, this service only reads.
  """

  import Ecto.Query

  alias SocketService.Repo

  @doc """
  Whether the user may join the workspace's channel: an active member of it, while it is not
  deleted; its owner also while it is (as `GET /workspaces/{id}` in main).
  """
  @callback member?(user_id :: String.t(), workspace_id :: String.t()) :: boolean()

  @behaviour __MODULE__

  @impl true
  def member?(user_id, workspace_id) do
    with {:ok, user_id} <- Ecto.UUID.cast(user_id),
         {:ok, workspace_id} <- Ecto.UUID.cast(workspace_id) do
      query =
        from(m in "members",
          join: w in "workspaces",
          on: w.id == m.workspace_id,
          where:
            m.workspace_id == type(^workspace_id, Ecto.UUID) and
              m.user_id == type(^user_id, Ecto.UUID) and
              is_nil(m.deactivated_at) and
              (is_nil(w.deleted_at) or m.is_owner)
        )

      Repo.exists?(query)
    else
      :error -> false
    end
  end
end
