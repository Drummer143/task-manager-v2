defmodule SocketService.Repo do
  use Ecto.Repo,
    otp_app: :socket_service,
    adapter: Ecto.Adapters.Postgres
end
