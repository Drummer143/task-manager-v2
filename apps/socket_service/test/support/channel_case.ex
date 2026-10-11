defmodule SocketService.ChannelCase do
  @moduledoc """
  The test case for channel tests: `Phoenix.ChannelTest` against the app's endpoint.
  """

  use ExUnit.CaseTemplate

  using do
    quote do
      import Phoenix.ChannelTest

      @endpoint SocketServiceWeb.Endpoint
    end
  end
end
