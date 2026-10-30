-- AEIOS v0 cloud schema: gateway data, access control. Applied to project aeios-cloud on 2026-10-30.
-- Writes happen only through the `ingest` edge function (service role); signed-in, allow-listed users can read.

create table public.allowed_users (
  email text primary key,
  added_at timestamptz not null default now()
);

create table public.nodes (
  node text primary key,
  site_id text check (site_id in ('sgt','chandu')),
  station_code text,
  label text
);

create table public.packets (
  id bigint generated always as identity primary key,
  device_id text not null,
  pi_id bigint not null,
  rx_utc timestamptz not null,
  source text not null default 'lora',
  node text not null,
  boot integer,
  node_time text,
  temp real, rh real, pressure real, gas_kohm real,
  pm1 real, pm2_5 real, pm10 real, mq_mv real,
  lat double precision, lon double precision, fix integer, sats integer,
  rssi real, snr real,
  received_at timestamptz not null default now(),
  unique (device_id, pi_id)
);
create index packets_node_time on public.packets (node, rx_utc desc);

create table public.predictions (
  id bigint generated always as identity primary key,
  device_id text not null,
  pi_id bigint not null,
  packet_pi_id bigint,
  source text,
  node text not null,
  target text not null,
  horizon_min integer not null,
  made_utc timestamptz not null,
  due_utc timestamptz not null,
  now_value real, p50 real, p10 real, p90 real,
  model text, model_updates integer,
  unique (device_id, pi_id)
);
create index predictions_node_made on public.predictions (node, made_utc desc);
create index predictions_due on public.predictions (due_utc);

create table public.anomalies (
  id bigint generated always as identity primary key,
  device_id text not null,
  pi_id bigint not null,
  packet_pi_id bigint,
  source text,
  node text not null,
  utc timestamptz not null,
  signal text not null,
  value real, median_24h real, z real,
  unique (device_id, pi_id)
);
create index anomalies_node_utc on public.anomalies (node, utc desc);

create table public.gateway_status (
  device_id text primary key,
  last_seen timestamptz not null default now(),
  info jsonb
);

alter table public.allowed_users enable row level security;
alter table public.nodes enable row level security;
alter table public.packets enable row level security;
alter table public.predictions enable row level security;
alter table public.anomalies enable row level security;
alter table public.gateway_status enable row level security;

create or replace function public.is_allowed()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.allowed_users u
    where lower(u.email) = lower(coalesce((select auth.jwt() ->> 'email'), ''))
  );
$$;
revoke all on function public.is_allowed() from public, anon;
grant execute on function public.is_allowed() to authenticated;

create policy "read own allow entry" on public.allowed_users
  for select to authenticated using (lower(email) = lower(coalesce((select auth.jwt() ->> 'email'), '')));
create policy "allowed read nodes" on public.nodes for select to authenticated using ((select public.is_allowed()));
create policy "allowed read packets" on public.packets for select to authenticated using ((select public.is_allowed()));
create policy "allowed read predictions" on public.predictions for select to authenticated using ((select public.is_allowed()));
create policy "allowed read anomalies" on public.anomalies for select to authenticated using ((select public.is_allowed()));
create policy "allowed read gateway status" on public.gateway_status for select to authenticated using ((select public.is_allowed()));

-- Seed data (not committed): see backend/supabase/seed.example.sql
