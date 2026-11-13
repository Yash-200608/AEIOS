-- Open access: anyone who creates an account (and has an email on their session) can read the dashboard data.
--
-- Before: is_allowed() was true only for emails listed in public.allowed_users.
-- After:  is_allowed() is true for any signed-in user that has an email. Anonymous sign-ins (no email) stay excluded.
--
-- Every read policy already goes through is_allowed(), so no policy changes are needed. public.allowed_users is kept
-- (unused) so this can be reverted by restoring the previous function body below.
--
-- Note: whether an address must be confirmed before a session exists is a Supabase Auth project setting
-- (Authentication > Providers > Email > "Confirm email"), not something this migration controls.
--
-- To revert (admin-approved access again):
--   create or replace function public.is_allowed() returns boolean language sql stable security definer set search_path = ''
--   as $$ select exists (select 1 from public.allowed_users u
--        where lower(u.email) = lower(coalesce((select auth.jwt() ->> 'email'), ''))); $$;

create or replace function public.is_allowed()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce((select auth.jwt() ->> 'email'), '') <> '';
$$;

revoke all on function public.is_allowed() from public, anon;
grant execute on function public.is_allowed() to authenticated;
