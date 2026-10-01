ALTER TABLE task_chat_messages
ADD COLUMN "pinned_by" uuid;

ALTER TABLE task_chat_messages
ADD COLUMN "reply_to" uuid;

ALTER TABLE task_chat_messages ADD CONSTRAINT "fk_task_chat_messages_pinned_by" FOREIGN KEY (pinned_by) REFERENCES users (id) ON DELETE SET NULL;

ALTER TABLE task_chat_messages ADD CONSTRAINT "fk_task_chat_messages_reply_to" FOREIGN KEY (reply_to) REFERENCES task_chat_messages (id) ON DELETE SET NULL;
