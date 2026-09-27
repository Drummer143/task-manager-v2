defmodule SocketServerWeb.Router do
  use SocketServerWeb, :router

  pipeline :api do
    plug :accepts, ["json"]
  end

  scope "/api", SocketServerWeb do
    pipe_through :api
  end
end
