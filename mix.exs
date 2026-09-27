defmodule TaskManager.MixProject do
  use Mix.Project

  def project do
    [
      apps_path: "apps",
      # apps/ is shared with non-Elixir Nx projects, so umbrella children are listed explicitly
      apps: [:socket_server],
      version: "0.1.0",
      start_permanent: Mix.env() == :prod,
      deps: deps(),
      releases: releases()
    ]
  end

  # One release per deployable app; built by docker/Dockerfile.elixir via `mix release <name>`
  defp releases do
    [
      socket_server: [applications: [socket_server: :permanent]]
    ]
  end

  # Dependencies listed here are available only for this
  # project and cannot be accessed from applications inside
  # the apps folder.
  #
  # Run "mix help deps" for examples and options.
  defp deps do
    []
  end
end
