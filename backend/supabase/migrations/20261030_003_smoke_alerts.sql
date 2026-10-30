-- Smoke alerts raised by the Pi gateway (edge/v0/smoke_watch.py).
create table public.smoke_alerts (
  id bigint generated always as identity primary key,
  device_id text not null,
  pi_id bigint not null,
  utc timestamptz not null,
  site text not null,
  level text not null check (level in ('WATCH','WARNING')),
  hours_ahead integer,
  fires integer,
  frp_mw real,
  origin_km integer,
  origin_dir text,
  height text,
  local_pm25 real,
  stale_h real,
  message text,
  unique (device_id, pi_id)
);
create index smoke_alerts_utc on public.smoke_alerts (utc desc);
alter table public.smoke_alerts enable row level security;
create policy "allowed read smoke alerts" on public.smoke_alerts for select to authenticated using ((select public.is_allowed()));
