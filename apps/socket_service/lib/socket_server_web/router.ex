defmodule SocketServiceWeb.Router do
  use SocketServiceWeb, :router

  pipeline :api do
    plug :accepts, ["json"]
  end

  scope "/api", SocketServiceWeb do
    pipe_through :api
  end
end
