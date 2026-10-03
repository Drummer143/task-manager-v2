CREATE TABLE users (
    id UUID PRIMARY KEY,
    authentik_id INTEGER NOT NULL UNIQUE,
    username TEXT NOT NULL,
    email TEXT,
    picture TEXT,
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX users_email_idx ON users (email);
