defmodule SocketService.Application do
  # See https://elixir.hexdocs.pm/Application.html
  # for more information on OTP Applications
  @moduledoc false

  use Application

  @impl true
  def start(_type, _args) do
    # SocketService.Repo is not started: there are no queries yet, and it needs postgrex and a
    # database config first (add both with the chat)
    children =
      [
        SocketServiceWeb.Telemetry,
        {DNSCluster, query: Application.get_env(:socket_service, :dns_cluster_query) || :ignore},
        {Phoenix.PubSub, name: SocketService.PubSub}
      ] ++
        external_services() ++
        [
          # Start to serve requests, typically the last entry
          SocketServiceWeb.Endpoint
        ]

    # See https://elixir.hexdocs.pm/Supervisor.html
    # for other strategies and supported options
    opts = [strategy: :one_for_one, name: SocketService.Supervisor]
    Supervisor.start_link(children, opts)
  end

  # The JWKS fetcher (authentik) and the RabbitMQ consumer; off in tests
  defp external_services do
    if Application.get_env(:socket_service, :external_services, true) do
      [SocketService.AuthVerifier.TokenStrategy, SocketService.Notifications.Consumer]
    else
      []
    end
  end

  # Tell Phoenix to update the endpoint configuration
  # whenever the application is updated.
  @impl true
  def config_change(changed, _new, removed) do
    SocketServiceWeb.Endpoint.config_change(changed, removed)
    :ok
  end
end
