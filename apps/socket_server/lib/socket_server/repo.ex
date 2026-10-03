defmodule SocketServer.Repo do
  use Ecto.Repo,
    otp_app: :socket_server,
    adapter: Ecto.Adapters.Postgres
end
