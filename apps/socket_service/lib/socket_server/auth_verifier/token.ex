defmodule SocketService.AuthVerifier.Token do
  use Joken.Config

  require Logger

  add_hook(JokenJwks, strategy: SocketService.AuthVerifier.TokenStrategy)

  def token_config do
    expected_iss = Application.fetch_env!(:socket_service, :issuer)
    expected_aud = Application.fetch_env!(:socket_service, :audience)

    default_claims()
    |> add_claim("iss", nil, fn val -> val == expected_iss end)
    |> add_claim("aud", nil, fn val -> val == expected_aud end)
  end
end
