defmodule SocketServiceWeb.ErrorJSONTest do
  use SocketServiceWeb.ConnCase, async: true

  test "renders 404" do
    assert SocketServiceWeb.ErrorJSON.render("404.json", %{}) == %{errors: %{detail: "Not Found"}}
  end

  test "renders 500" do
    assert SocketServiceWeb.ErrorJSON.render("500.json", %{}) ==
             %{errors: %{detail: "Internal Server Error"}}
  end
end
