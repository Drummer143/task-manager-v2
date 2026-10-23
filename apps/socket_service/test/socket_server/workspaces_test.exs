defmodule SocketService.WorkspacesTest do
  # Reads main's tables: see test_helper.exs. Each test writes in a transaction it rolls back.
  use ExUnit.Case, async: false

  alias SocketService.{Repo, Workspaces}

  @moduletag :db

  setup_all do
    start_supervised!({Repo, url: System.fetch_env!("DATABASE_URL"), pool_size: 1})
    :ok
  end

  defp in_rollback(fun) do
    Repo.transaction(fn ->
      fun.()
      Repo.rollback(:done)
    end)
  end

  defp uuid, do: Ecto.UUID.generate()

  defp user do
    id = uuid()
    Repo.query!("INSERT INTO users (id, username) VALUES ($1::text::uuid, 'test')", [id])
    id
  end

  defp workspace(deleted? \\ false) do
    id = uuid()

    Repo.query!(
      """
      INSERT INTO workspaces (id, name, slug, task_prefix, deleted_at)
      VALUES ($1::text::uuid, 'Test', 'ws-' || $1, 'TS',
              CASE WHEN $2 THEN CURRENT_TIMESTAMP END)
      """,
      [id, deleted?]
    )

    id
  end

  defp member(workspace_id, user_id, opts \\ []) do
    Repo.query!(
      """
      INSERT INTO members (workspace_id, user_id, is_owner, deactivated_at)
      VALUES ($1::text::uuid, $2::text::uuid, $3, CASE WHEN $4 THEN CURRENT_TIMESTAMP END)
      """,
      [workspace_id, user_id, opts[:owner] || false, opts[:deactivated] || false]
    )
  end

  test "an active member of a live workspace is one" do
    in_rollback(fn ->
      {me, ws} = {user(), workspace()}
      member(ws, me)

      assert Workspaces.member?(me, ws)
      refute Workspaces.member?(user(), ws)
      refute Workspaces.member?(me, workspace())
    end)
  end

  test "a deactivated member is not" do
    in_rollback(fn ->
      {me, ws} = {user(), workspace()}
      member(ws, me, deactivated: true)

      refute Workspaces.member?(me, ws)
    end)
  end

  test "a deleted workspace is its owner's only" do
    in_rollback(fn ->
      {owner, other, ws} = {user(), user(), workspace(true)}
      member(ws, owner, owner: true)
      member(ws, other)

      assert Workspaces.member?(owner, ws)
      refute Workspaces.member?(other, ws)
    end)
  end

  test "ids that are not uuids are no one's, without a query" do
    refute Workspaces.member?("not-a-uuid", uuid())
    refute Workspaces.member?(uuid(), "not-a-uuid")
  end
end
