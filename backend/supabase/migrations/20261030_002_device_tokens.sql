-- Device tokens are stored only as SHA-256 hashes. RLS is on with no policies, so only the service role
-- (the ingest edge function) can read the table.
create table public.device_tokens (
  token_sha256 text primary key,
  label text,
  created_at timestamptz not null default now()
);
alter table public.device_tokens enable row level security;
