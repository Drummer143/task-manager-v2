defmodule SocketServer.AuthVerifier.TokenStrategy do
  require Logger

  use JokenJwks.DefaultStrategyTemplate

  def init_opts(_opts) do
    url = Application.get_env(:socket_server, :jwks_url)

    [
      jwks_url: url,
      time_interval: 5_000,
      log_level: :debug
    ]
  end
end
