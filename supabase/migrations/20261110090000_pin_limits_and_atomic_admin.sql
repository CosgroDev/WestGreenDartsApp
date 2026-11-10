-- PIN attempt limiting, one current season per team, and atomic season
-- switch / fixture delete. Idempotent; no scoring data is changed.
begin;

-- Failed PIN attempts per client. The key is a hash of the client address;
-- no address is stored.
create table if not exists public.pin_attempts (
 client_key text primary key,
 failures integer not null default 0,
 locked_until timestamptz,
 updated_at timestamptz not null default now()
);
alter table public.pin_attempts enable row level security;
revoke all on public.pin_attempts from anon, authenticated;
grant all on public.pin_attempts to service_role;

-- Seconds the client must still wait (0 when it may try).
create or replace function public.wgd_pin_locked(p_client text)
returns integer language sql stable set search_path = '' as $$
 select coalesce((select greatest(0, ceil(extract(epoch from locked_until - now())))::integer
  from public.pin_attempts where client_key = p_client), 0);
$$;

-- Record a failure. Five are free; after that each failure locks the client
-- for 30s, doubling up to 15 minutes. An hour without failures resets it.
create or replace function public.wgd_pin_failed(p_client text)
returns integer language plpgsql set search_path = '' as $$
declare n integer; wait integer;
begin
 insert into public.pin_attempts as a (client_key, failures, updated_at) values (p_client, 1, now())
 on conflict (client_key) do update
  set failures = case when a.updated_at < now() - interval '1 hour' then 1 else a.failures + 1 end,
      updated_at = now()
 returning failures into n;
 wait := case when n < 5 then 0 else least(900, 30 * (2 ^ least(n - 5, 10))::integer) end;
 update public.pin_attempts set locked_until = case when wait > 0 then now() + make_interval(secs => wait) end
  where client_key = p_client;
 delete from public.pin_attempts where updated_at < now() - interval '1 day';
 return wait;
end $$;

create or replace function public.wgd_pin_succeeded(p_client text)
returns void language sql set search_path = '' as $$
 delete from public.pin_attempts where client_key = p_client;
$$;

-- At most one current season per team. Keep the newest if several are set.
with ranked as (
 select id, row_number() over (partition by team_id order by created_at desc, id) n
 from public.seasons where is_current
)
update public.seasons s set is_current = false from ranked r where r.id = s.id and r.n > 1;
create unique index if not exists seasons_one_current on public.seasons (team_id) where is_current;

create or replace function public.wgd_set_current_season(p_team uuid, p_season uuid)
returns boolean language plpgsql set search_path = '' as $$
begin
 if not exists (select 1 from public.seasons where id = p_season and team_id = p_team) then
  return false;
 end if;
 update public.seasons set is_current = false where team_id = p_team and is_current and id <> p_season;
 update public.seasons set is_current = true where id = p_season and not is_current;
 return true;
end $$;

-- Delete a fixture and its (already removed) games in one transaction.
-- Refuses while any game is still live. Returns 'deleted', 'has_games' or 'not_found'.
create or replace function public.wgd_delete_fixture(p_team uuid, p_fixture uuid)
returns text language plpgsql set search_path = '' as $$
begin
 perform 1 from public.fixtures where id = p_fixture and team_id = p_team for update;
 if not found then return 'not_found'; end if;
 if exists (select 1 from public.games where fixture_id = p_fixture and not deleted) then
  return 'has_games';
 end if;
 delete from public.games where fixture_id = p_fixture;
 delete from public.fixtures where id = p_fixture;
 return 'deleted';
end $$;

revoke all on function public.wgd_pin_locked(text) from public, anon, authenticated;
revoke all on function public.wgd_pin_failed(text) from public, anon, authenticated;
revoke all on function public.wgd_pin_succeeded(text) from public, anon, authenticated;
revoke all on function public.wgd_set_current_season(uuid, uuid) from public, anon, authenticated;
revoke all on function public.wgd_delete_fixture(uuid, uuid) from public, anon, authenticated;
grant execute on function public.wgd_pin_locked(text) to service_role;
grant execute on function public.wgd_pin_failed(text) to service_role;
grant execute on function public.wgd_pin_succeeded(text) to service_role;
grant execute on function public.wgd_set_current_season(uuid, uuid) to service_role;
grant execute on function public.wgd_delete_fixture(uuid, uuid) to service_role;

commit;
