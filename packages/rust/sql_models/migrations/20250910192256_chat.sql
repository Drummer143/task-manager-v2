CREATE TABLE
    IF NOT EXISTS "task_chat_messages" (
        "id" uuid PRIMARY KEY NOT NULL DEFAULT (uuid_generate_v4 ()),
        "text" text NOT NULL,
        "user_id" uuid NOT NULL,
        "task_id" uuid NOT NULL,
        "created_at" timestamp NOT NULL DEFAULT (CURRENT_TIMESTAMP),
        "updated_at" timestamp NOT NULL DEFAULT (CURRENT_TIMESTAMP),
        "deleted_at" timestamp
    );

CREATE INDEX IF NOT EXISTS idx_task_chat_messages_task_id ON task_chat_messages (task_id);

ALTER TABLE "task_chat_messages" ADD CONSTRAINT "fk_task_chat_messages_user" FOREIGN KEY ("user_id") REFERENCES "users" ("id") ON DELETE CASCADE;

ALTER TABLE "task_chat_messages" ADD CONSTRAINT "fk_task_chat_messages_task" FOREIGN KEY ("task_id") REFERENCES "tasks" ("id") ON DELETE CASCADE;