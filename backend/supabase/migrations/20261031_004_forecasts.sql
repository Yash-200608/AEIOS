-- PM2.5 forecasts produced on the gateway Pi by ai/service/forecast_service.py.
-- Forecasts of CPCB station PM2.5 (not AEIOS node measurements). Writes go only through the `ingest` edge function.
create table public.forecasts (
  id bigint generated always as identity primary key,
  device_id text not null,
  pi_id bigint not null,
  station text not null,
  location_id integer not null,
  horizon_h integer not null check (horizon_h between 1 and 72),
  made_utc timestamptz not null,
  origin_utc timestamptz,
  due_utc timestamptz,
  source text not null check (source in ('lightgbm_cqr','fallback_persistence','no_input')),
  model_version text,
  input_source text not null,
  weather_source text,
  stale_h real,
  pm_now real,
  q10 real, q50 real, q90 real,
  interval text,
  drivers jsonb,
  reason text,
  unique (device_id, pi_id)
);
create index forecasts_station_made on public.forecasts (location_id, made_utc desc);
create index forecasts_due on public.forecasts (due_utc);

alter table public.forecasts enable row level security;
create policy "allowed read forecasts" on public.forecasts for select to authenticated using ((select public.is_allowed()));
