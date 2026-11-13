# backend/supabase — cloud for the v0 prototype

Project `aeios-cloud` (region ap-south-1).

- `migrations/` — SQL applied in order; reproduces the live schema (8 tables, row-level security).
- `functions/ingest` — only write path. The Pi posts batches with `X-AEIOS-Device-Token`; the function checks the
  SHA-256 of the token against `device_tokens`, validates rows, upserts idempotently (`device_id` + `pi_id`).
  Deployed with `verify_jwt=false` because it authenticates with the device token.
- `functions/fires` — public proxy that trims NASA FIRMS VIIRS fire CSVs to north-west India (FIRMS sends no CORS
  headers). Public satellite data only; reads nothing from the database.
- `seed.example.sql` — how to add the allow-list, nodes and device token with your own values.

Reading is allowed to any signed-in user that has an email (`public.is_allowed()`, migration `20261113_005`). The `allowed_users`
table is no longer consulted; the migration header shows how to restore admin-approved access.
Deploy functions with `supabase functions deploy ingest --no-verify-jwt` and `supabase functions deploy fires --no-verify-jwt`.
