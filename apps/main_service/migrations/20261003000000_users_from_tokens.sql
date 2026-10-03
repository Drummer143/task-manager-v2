-- GET /me creates the user from the access token on the first request, which can come before
-- authentik's user_created webhook. Tokens carry the user uuid but not authentik's numeric pk,
-- so the pk stays NULL until the webhook fills it in.
ALTER TABLE users ALTER COLUMN authentik_id DROP NOT NULL;
