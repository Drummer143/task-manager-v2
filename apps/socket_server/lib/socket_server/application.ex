defmodule SocketServer.Application do
  # See https://elixir.hexdocs.pm/Application.html
  # for more information on OTP Applications
  @moduledoc false

  use Application

  @impl true
  def start(_type, _args) do
    children = [
      SocketServerWeb.Telemetry,
      {DNSCluster, query: Application.get_env(:socket_server, :dns_cluster_query) || :ignore},
      {Phoenix.PubSub, name: SocketServer.PubSub},
      # Start a worker by calling: SocketServer.Worker.start_link(arg)
      # {SocketServer.Worker, arg},
      # Start to serve requests, typically the last entry
      SocketServerWeb.Endpoint
    ]

    # See https://elixir.hexdocs.pm/Supervisor.html
    # for other strategies and supported options
    opts = [strategy: :one_for_one, name: SocketServer.Supervisor]
    Supervisor.start_link(children, opts)
  end

  # Tell Phoenix to update the endpoint configuration
  # whenever the application is updated.
  @impl true
  def config_change(changed, _new, removed) do
    SocketServerWeb.Endpoint.config_change(changed, removed)
    :ok
  end
end
