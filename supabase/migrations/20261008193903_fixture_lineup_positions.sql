begin;
alter table public.games add column if not exists match_position smallint check (match_position between 1 and 6);
-- Allocate the existing active lineup once; keep deleted rows' stored positions
-- thereafter so removing a match never renumbers its neighbours.
with matches as (
 select fixture_id, coalesce(match_id::text,coalesce(west_green_player_id::text,'none') || '|' || lower(trim(opponent_player))) match_key,
 min(created_at) first_at
 from public.games where not deleted group by fixture_id,2
), positions as (
 select *,row_number() over(partition by fixture_id order by first_at,match_key) position from matches
)
update public.games g set match_position=p.position from positions p
where not g.deleted and g.fixture_id=p.fixture_id and g.match_position is null and p.position<=6
 and coalesce(g.match_id::text,coalesce(g.west_green_player_id::text,'none') || '|' || lower(trim(g.opponent_player)))=p.match_key;

-- Existing next-leg scoring commands automatically inherit the first leg's slot.
create or replace function public.wgd_inherit_match_position() returns trigger language plpgsql set search_path='' as $$
begin
 if new.match_position is null and new.match_id is not null then
  select g.match_position into new.match_position from public.games g
   where g.match_id=new.match_id and g.fixture_id=new.fixture_id and g.match_position is not null
   order by g.created_at,g.id limit 1;
 end if;
 return new;
end;
$$;
drop trigger if exists inherit_match_position on public.games;
create trigger inherit_match_position before insert on public.games for each row execute function public.wgd_inherit_match_position();

create or replace function public.wgd_create_fixture_match(p_fixture uuid,p_team uuid,p_player uuid,p_opponent text,p_game uuid)
returns uuid language plpgsql set search_path='' as $$
declare is_home boolean; position smallint; saved public.games%rowtype;
begin
 select f.home into is_home from public.fixtures f where f.id=p_fixture and f.team_id=p_team for update;
 if not found then raise exception 'Fixture not found'; end if;
 select g.* into saved from public.games g where g.id=p_game and g.fixture_id=p_fixture and g.team_id=p_team and not g.deleted;
 if found then
  if saved.west_green_player_id is distinct from p_player or saved.opponent_player is distinct from trim(p_opponent) then
   raise exception 'This request already saved a match with different details. Review the lineup before starting another';
  end if;
  return p_game;
 end if;
 if p_player is null or not exists(select 1 from public.players p where p.id=p_player and p.team_id=p_team and p.active) then
  raise exception 'Choose an active West Green player'; end if;
 if nullif(trim(p_opponent),'') is null then raise exception 'Enter the opponent player'; end if;
 if (select count(distinct coalesce(g.match_id::text,coalesce(g.west_green_player_id::text,'none') || '|' || lower(trim(g.opponent_player)))) from public.games g where g.fixture_id=p_fixture and not g.deleted)>=6 then
  raise exception 'All six match positions are filled'; end if;
 select slot::smallint into position from generate_series(1,6) slot
 where not exists(select 1 from public.games g where g.fixture_id=p_fixture and not g.deleted and g.match_position=slot)
 order by slot limit 1;
 if position is null then raise exception 'All six match positions are filled'; end if;
 insert into public.games(id,team_id,fixture_id,match_id,match_position,west_green_player_id,opponent_player,west_green_starts)
 values(p_game,p_team,p_fixture,gen_random_uuid(),position,p_player,trim(p_opponent),not is_home);
 return p_game;
end;
$$;

create or replace function public.wgd_delete_fixture_match(p_fixture uuid,p_team uuid,p_match uuid,p_player uuid,p_opponent text)
returns void language plpgsql set search_path='' as $$
declare ids uuid[];
begin
 perform 1 from public.fixtures f where f.id=p_fixture and f.team_id=p_team for update;
 if not found then raise exception 'Fixture not found'; end if;
 select array_agg(g.id) into ids from public.games g where g.fixture_id=p_fixture and g.team_id=p_team and not g.deleted
 and ((p_match is not null and g.match_id=p_match) or (p_match is null and g.match_id is null and g.west_green_player_id is not distinct from p_player and lower(trim(g.opponent_player))=lower(trim(p_opponent))));
 if ids is null then raise exception 'Match not found. Refresh the lineup and try again'; end if;
 update public.scoring_events set is_deleted=true where game_id=any(ids);
 update public.games set deleted=true,ai_review=null,ai_review_at=null where id=any(ids);
 update public.fixtures set ai_team_review=null,ai_team_review_at=null where id=p_fixture;
end;
$$;

create or replace function public.wgd_delete_empty_fixture(p_fixture uuid,p_team uuid)
returns void language plpgsql set search_path='' as $$
begin
 perform 1 from public.fixtures f where f.id=p_fixture and f.team_id=p_team for update;
 if not found then raise exception 'Fixture not found'; end if;
 if exists(select 1 from public.games g where g.fixture_id=p_fixture and not g.deleted) then raise exception 'Remove the matches before deleting this fixture'; end if;
 delete from public.fixtures where id=p_fixture and team_id=p_team;
end;
$$;
revoke all on function public.wgd_inherit_match_position() from public,anon,authenticated;
revoke all on function public.wgd_create_fixture_match(uuid,uuid,uuid,text,uuid) from public,anon,authenticated;
grant execute on function public.wgd_create_fixture_match(uuid,uuid,uuid,text,uuid) to service_role;
revoke all on function public.wgd_delete_fixture_match(uuid,uuid,uuid,uuid,text) from public,anon,authenticated;
grant execute on function public.wgd_delete_fixture_match(uuid,uuid,uuid,uuid,text) to service_role;
revoke all on function public.wgd_delete_empty_fixture(uuid,uuid) from public,anon,authenticated;
grant execute on function public.wgd_delete_empty_fixture(uuid,uuid) to service_role;
create or replace function public.wgd_create_fixture(p_team uuid,p_season uuid,p_fixture uuid,p_starts timestamptz,p_home boolean,p_opponent text,p_venue text,p_notes text)
returns uuid language plpgsql set search_path='' as $$
declare saved public.fixtures%rowtype;
begin
 perform 1 from public.teams t where t.id=p_team for update;
 if not found then raise exception 'Team not found'; end if;
 if not exists(select 1 from public.seasons s where s.id=p_season and s.team_id=p_team) then raise exception 'Season not found'; end if;
 if p_fixture is null or p_starts is null or nullif(trim(p_opponent),'') is null then raise exception 'Season, date/time and opponent are required'; end if;
 select f.* into saved from public.fixtures f where f.id=p_fixture and f.team_id=p_team;
 if found then
  if saved.season_id is distinct from p_season or saved.starts_at is distinct from p_starts or saved.home is distinct from p_home
   or saved.opponent is distinct from trim(p_opponent) or saved.venue is distinct from nullif(trim(p_venue),'') or saved.notes is distinct from nullif(trim(p_notes),'') then
   raise exception 'This request already saved a fixture with different details. Refresh to review it before creating another';
  end if;
  return p_fixture;
 end if;
 insert into public.fixtures(id,team_id,season_id,starts_at,home,opponent,venue,notes)
 values(p_fixture,p_team,p_season,p_starts,p_home,trim(p_opponent),nullif(trim(p_venue),''),nullif(trim(p_notes),''));
 return p_fixture;
end;
$$;
revoke all on function public.wgd_create_fixture(uuid,uuid,uuid,timestamptz,boolean,text,text,text) from public,anon,authenticated;
grant execute on function public.wgd_create_fixture(uuid,uuid,uuid,timestamptz,boolean,text,text,text) to service_role;

create or replace function public.wgd_set_current_season(p_team uuid,p_season uuid)
returns void language plpgsql set search_path='' as $$
begin
 perform 1 from public.teams t where t.id=p_team for update;
 if not found then raise exception 'Team not found'; end if;
 if not exists(select 1 from public.seasons s where s.id=p_season and s.team_id=p_team) then raise exception 'Season not found'; end if;
 update public.seasons set is_current=(id=p_season) where team_id=p_team;
end;
$$;
revoke all on function public.wgd_set_current_season(uuid,uuid) from public,anon,authenticated;
grant execute on function public.wgd_set_current_season(uuid,uuid) to service_role;
commit;
