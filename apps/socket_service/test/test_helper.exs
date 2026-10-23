SocketService.FakeWorkspaces.start()

# The :db tests read main's tables: they need DATABASE_URL to a disposable Postgres migrated by
# main (`sqlx migrate run --source apps/main_service/migrations`). Never a shared database.
ExUnit.start(exclude: if(System.get_env("DATABASE_URL"), do: [], else: [:db]))
