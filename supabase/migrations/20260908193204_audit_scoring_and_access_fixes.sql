-- Apply after schema.sql and the existing feature SQL files, before deploying
-- the matching application. Idempotent, transactional; no production data is deleted.
begin;

-- Normalize legacy match IDs without merging distinct existing IDs.
with groups as (
 select fixture_id,west_green_player_id,lower(trim(opponent_player)) opponent,gen_random_uuid() mid
 from public.games where match_id is null
 group by fixture_id,west_green_player_id,lower(trim(opponent_player))
)
update public.games g set match_id=x.mid from groups x
where g.match_id is null and g.fixture_id=x.fixture_id
 and g.west_green_player_id is not distinct from x.west_green_player_id and lower(trim(g.opponent_player))=x.opponent;
with legs as (
 select g.id,f.home,row_number() over(partition by g.match_id order by g.created_at,g.id) n
 from public.games g join public.fixtures f on f.id=g.fixture_id where not g.deleted
)
update public.games g set west_green_starts=case when l.n%2=1 then not l.home else l.home end from legs l where l.id=g.id;
alter table public.games add column if not exists ai_review text;
alter table public.games add column if not exists ai_review_at timestamptz;
alter table public.fixtures add column if not exists ai_team_review text;
alter table public.fixtures add column if not exists ai_team_review_at timestamptz;
alter table public.seasons add column if not exists ai_season_summary text;
alter table public.seasons add column if not exists ai_season_summary_at timestamptz;
alter table public.seasons add column if not exists ai_season_summary_fixtures integer;

alter table public.games add column if not exists revision bigint not null default 0;
alter table public.games add column if not exists high_finish integer;
alter table public.practice_games add column if not exists revision bigint not null default 0;
alter table public.scoring_events add column if not exists thrower text not null default 'west_green';
alter table public.scoring_events add column if not exists request_id uuid;
alter table public.practice_events add column if not exists request_id uuid;

-- Normalize historical indexes without dropping any visits (including undone visits).
with numbered as (
 select id, row_number() over (partition by game_id order by throw_index, id) as n from public.scoring_events
) update public.scoring_events e set throw_index = n.n from numbered n where n.id=e.id;
with numbered as (
 select id, row_number() over (partition by game_id order by throw_index, id) as n from public.practice_events
) update public.practice_events e set throw_index = n.n from numbered n where n.id=e.id;
create unique index if not exists scoring_event_sequence on public.scoring_events(game_id, throw_index);
create unique index if not exists practice_event_sequence on public.practice_events(game_id, throw_index);

create table if not exists public.wgd_commands (
 request_id uuid primary key,
 game_id uuid not null,
 result jsonb not null,
 created_at timestamptz not null default now()
);
alter table public.wgd_commands enable row level security;
revoke all on public.wgd_commands from anon, authenticated;
grant all on public.wgd_commands to service_role;

create or replace function public.wgd_can_finish(remaining integer, darts integer default 3)
returns boolean language sql immutable set search_path = '' as $$
 with scores as (
  select 0 n union select 25 union select 50
  union select s*m from generate_series(1,20) s cross join generate_series(1,3) m
 ), doubles as (select 2*s n from generate_series(1,20) s union select 50)
 select darts between 1 and 3 and remaining between 2 and 170 and exists (
  select 1 from doubles d cross join scores a cross join scores b
  where d.n + a.n + b.n = remaining
    and (darts >= 2 or a.n=0) and (darts >= 3 or b.n=0)
 );
$$;

-- Both league and practice commands are serialized by a parent row lock.
-- Only the server's service role can call this function. It is SECURITY INVOKER.
create or replace function public.wgd_score_command(
 p_game uuid, p_team uuid, p_revision bigint, p_request uuid,
 p_practice boolean, p_command text, p_side text default 'west_green',
 p_score integer default 0, p_darts integer default 3
) returns jsonb language plpgsql set search_path = '' as $$
declare
 g jsonb; sess jsonb; cached jsonb; result jsonb;
 v_session uuid; next_game uuid; last_event jsonb;
 remaining integer; after_score integer; start_score integer := 501;
 checkout boolean; bust boolean; idx integer; total_darts integer;
 completed integer; next_index integer; mid uuid;
begin
 if p_team is null or p_request is null then raise exception 'Team and request ID required'; end if;
 if p_practice then
  select pg.session_id into v_session from public.practice_games pg where pg.id=p_game;
  select to_jsonb(s) into sess from public.practice_sessions s where s.id=v_session and s.team_id=p_team for update;
  if sess is null then raise exception 'Session not found'; end if;
  select to_jsonb(pg) into g from public.practice_games pg where pg.id=p_game for update;
  start_score := (sess->>'start_score')::integer;
 else
  -- Serialize sibling legs too: undoing an earlier checkout must not race
  -- with the first visit in its successor. Always take the parent lock first.
  perform 1 from public.fixtures f where f.id=(select lg.fixture_id from public.games lg where lg.id=p_game and lg.team_id=p_team) for update;
  select to_jsonb(lg) into g from public.games lg where lg.id=p_game and lg.team_id=p_team and not lg.deleted for update;
 end if;
 if g is null then raise exception 'Game not found'; end if;
 select c.result into cached from public.wgd_commands c where c.request_id=p_request and c.game_id=p_game;
 if cached is not null then return cached; end if;
 if p_revision is null or p_revision <> (g->>'revision')::bigint then
  raise exception 'The score changed on another device. Reload before scoring again.';
 end if;

 if p_command = 'new_leg' and not p_practice then
  if g->>'status' <> 'completed' then raise exception 'Finish this leg first'; end if;
  mid := (g->>'match_id')::uuid;
  select lg.id into next_game from public.games lg where lg.match_id=mid and not lg.deleted and lg.status='in_progress' order by lg.created_at limit 1;
  if next_game is null then
   select count(*) into completed from public.games lg where lg.match_id=mid and not lg.deleted;
   if completed >= 2 then raise exception 'Match is already complete'; end if;
   insert into public.games(team_id,fixture_id,match_id,west_green_player_id,opponent_player,west_green_starts)
    values(p_team,(g->>'fixture_id')::uuid,mid,(g->>'west_green_player_id')::uuid,g->>'opponent_player',not (g->>'west_green_starts')::boolean)
    returning id into next_game;
  end if;
 elsif p_command = 'record' then
  if g->>'status' <> 'in_progress' or (p_practice and sess->>'status' <> 'in_progress') then raise exception 'This game is no longer active'; end if;
  if p_score is null or p_score < 0 or p_score > 180 or p_darts is null or p_darts not between 1 and 3 then raise exception 'Invalid score or dart count'; end if;
  if (p_practice and p_side not in ('player_a','player_b')) or (not p_practice and p_side not in ('west_green','opponent')) or p_side is null then raise exception 'Invalid player'; end if;
  if p_practice then
   select e.remaining_after into remaining from public.practice_events e where e.game_id=p_game and not e.is_deleted and e.thrower=p_side order by e.throw_index desc limit 1;
   select coalesce(max(e.throw_index),0)+1 into idx from public.practice_events e where e.game_id=p_game;
  else
   select e.remaining_after into remaining from public.scoring_events e where e.game_id=p_game and not e.is_deleted and e.thrower=p_side order by e.throw_index desc limit 1;
   select coalesce(max(e.throw_index),0)+1 into idx from public.scoring_events e where e.game_id=p_game;
  end if;
  remaining := coalesce(remaining,start_score);
  checkout := remaining-p_score=0 and public.wgd_can_finish(remaining,3);
  if checkout and not public.wgd_can_finish(remaining,p_darts) then raise exception 'That checkout needs more darts'; end if;
  bust := not checkout and remaining-p_score <= 1;
  after_score := case when bust then remaining else remaining-p_score end;
  if not checkout then p_darts := 3; end if;
  if p_practice then
   insert into public.practice_events(team_id,session_id,game_id,throw_index,thrower,score,darts,remaining_after,is_bust,is_checkout,request_id)
    values(p_team,v_session,p_game,idx,p_side,p_score,p_darts,after_score,bust,checkout,p_request);
   if checkout then
    select sum(e.darts) into total_darts from public.practice_events e where e.game_id=p_game and e.thrower=p_side and not e.is_deleted;
    update public.practice_games set status='completed',winner=p_side,darts_thrown=total_darts,high_finish=p_score,completed_at=now() where id=p_game;
    select count(*) into completed from public.practice_games pg where pg.session_id=v_session and pg.status='completed';
    if completed >= (sess->>'legs_to_play')::integer then
     update public.practice_sessions set status='completed',completed_at=now() where id=v_session;
    else
     next_index := (g->>'leg_index')::integer+1;
     if not exists(select 1 from public.practice_games pg where pg.session_id=v_session and pg.leg_index=next_index) then
      insert into public.practice_games(session_id,leg_index) values(v_session,next_index) returning id into next_game;
     end if;
    end if;
   end if;
  else
   insert into public.scoring_events(team_id,game_id,throw_index,thrower,score,darts,remaining_after,is_bust,is_checkout,request_id)
    values(p_team,p_game,idx,p_side,p_score,p_darts,after_score,bust,checkout,p_request);
   if checkout then
    select sum(e.darts) into total_darts from public.scoring_events e where e.game_id=p_game and e.thrower='west_green' and not e.is_deleted;
    update public.games set status='completed',winner=p_side,darts_thrown=case when p_side='west_green' then total_darts end,
     high_finish=case when p_side='west_green' then p_score end,completed_at=now() where id=p_game;
   end if;
  end if;
 elsif p_command = 'undo' then
  if p_practice then
   if sess->>'status' not in ('in_progress','completed') then raise exception 'Session is not active'; end if;
   select to_jsonb(e) into last_event from public.practice_events e where e.game_id=p_game and not e.is_deleted order by e.throw_index desc limit 1;
  else
   select to_jsonb(e) into last_event from public.scoring_events e where e.game_id=p_game and not e.is_deleted order by e.throw_index desc limit 1;
  end if;
  if last_event is not null then
   if (last_event->>'is_checkout')::boolean then
    if p_practice then
     if exists(select 1 from public.practice_games pg join public.practice_events e on e.game_id=pg.id where pg.session_id=v_session and pg.leg_index>(g->>'leg_index')::integer and not e.is_deleted) then raise exception 'Cannot undo after the next leg has started'; end if;
     delete from public.practice_games pg where pg.session_id=v_session and pg.leg_index>(g->>'leg_index')::integer;
     update public.practice_sessions set status='in_progress',completed_at=null where id=v_session;
    else
     if exists(select 1 from public.games lg join public.scoring_events e on e.game_id=lg.id where lg.match_id=(g->>'match_id')::uuid and lg.created_at>(g->>'created_at')::timestamptz and not lg.deleted and not e.is_deleted) then raise exception 'Cannot undo after the next leg has started'; end if;
     update public.games set deleted=true where match_id=(g->>'match_id')::uuid and created_at>(g->>'created_at')::timestamptz;
    end if;
   end if;
   if p_practice then
    update public.practice_events set is_deleted=true where id=(last_event->>'id')::bigint;
    update public.practice_games set status='in_progress',winner=null,darts_thrown=null,high_finish=null,completed_at=null where id=p_game;
   else
    update public.scoring_events set is_deleted=true where id=(last_event->>'id')::bigint;
    update public.games set status='in_progress',winner=null,darts_thrown=null,high_finish=null,completed_at=null where id=p_game;
   end if;
  end if;
 else raise exception 'Unknown scoring command';
 end if;

 if p_practice then
  update public.practice_games set revision=revision+1 where id=p_game;
 else
  update public.games set revision=revision+1 where id=p_game;
  -- Recorded data changed: cached commentary is no longer a reliable summary.
  update public.games set ai_review=null,ai_review_at=null where match_id=(g->>'match_id')::uuid;
  update public.fixtures set ai_team_review=null,ai_team_review_at=null where id=(g->>'fixture_id')::uuid;
  update public.seasons set ai_season_summary=null where id=(select f.season_id from public.fixtures f where f.id=(g->>'fixture_id')::uuid);
 end if;
 result := jsonb_build_object('ok',true,'next_game_id',next_game,'undidThrower',last_event->>'thrower');
 insert into public.wgd_commands(request_id,game_id,result) values(p_request,p_game,result);
 return result;
end;
$$;
revoke all on function public.wgd_score_command(uuid,uuid,bigint,uuid,boolean,text,text,integer,integer) from public,anon,authenticated;
grant execute on function public.wgd_score_command(uuid,uuid,bigint,uuid,boolean,text,text,integer,integer) to service_role;

alter table public.game_121_sessions add column if not exists revision bigint not null default 0;
alter table public.checkout_practice_sessions add column if not exists revision bigint not null default 0;
alter table public.doubles_practice_sessions add column if not exists revision bigint not null default 0;

create or replace function public.wgd_drill_command(
 p_mode text, p_session uuid, p_team uuid, p_revision bigint, p_request uuid,
 p_event jsonb, p_patch jsonb, p_player uuid default null, p_player_patch jsonb default null
) returns jsonb language plpgsql set search_path = '' as $$
declare s jsonb; cached jsonb; table_name text;
begin
 table_name := case p_mode when '121' then 'game_121_sessions' when 'checkout' then 'checkout_practice_sessions' when 'doubles' then 'doubles_practice_sessions' end;
 if table_name is null or p_team is null or p_request is null then raise exception 'Invalid command'; end if;
 execute format('select to_jsonb(s) from public.%I s where id=$1 and team_id=$2 for update',table_name) into s using p_session,p_team;
 if s is null then raise exception 'Session not found'; end if;
 select result into cached from public.wgd_commands where request_id=p_request and game_id=p_session;
 if cached is not null then return cached; end if;
 if s->>'status' <> 'in_progress' then raise exception 'Session is no longer active'; end if;
 if p_revision is null or p_revision <> (s->>'revision')::bigint then raise exception 'Session changed on another device. Reload before scoring again.'; end if;
 if p_event is null then
  if p_patch->>'status' not in ('completed','abandoned') then raise exception 'Invalid session status'; end if;
  execute format('update public.%I set status=$1,completed_at=now(),revision=revision+1 where id=$2',table_name) using p_patch->>'status',p_session;
 elsif p_mode='121' then
  insert into public.game_121_turns(session_id,checkout,base_checkout,turn_number,score,remaining_before,remaining_after,is_bust,result)
  values(p_session,(s->>'current_checkout')::int,(s->>'base_checkout')::int,(s->>'current_turn')::int,
    (p_event->>'score')::int,(s->>'remaining')::int,(p_event->>'remaining_after')::int,(p_event->>'is_bust')::boolean,p_event->>'result');
  update public.game_121_sessions set base_checkout=(p_patch->>'base_checkout')::int,current_checkout=(p_patch->>'current_checkout')::int,
    current_turn=(p_patch->>'current_turn')::int,remaining=(p_patch->>'remaining')::int,status=p_patch->>'status',
    completed_at=(p_patch->>'completed_at')::timestamptz,revision=revision+1 where id=p_session;
 elsif p_mode='checkout' then
  if (p_event->>'success')::boolean and not public.wgd_can_finish((s->>'current_target')::int,(p_event->>'darts_used')::int) then raise exception 'That checkout needs more darts'; end if;
  insert into public.checkout_practice_attempts(session_id,target,darts_used,success)
    values(p_session,(s->>'current_target')::int,(p_event->>'darts_used')::int,(p_event->>'success')::boolean);
  update public.checkout_practice_sessions set current_target=(p_patch->>'current_target')::int,attempt_index=attempt_index+1,revision=revision+1 where id=p_session;
 else
  if not exists(select 1 from public.doubles_practice_players where id=p_player and session_id=p_session and throw_order=(s->>'current_slot')::int) then raise exception 'Wrong player'; end if;
  insert into public.doubles_practice_attempts(session_id,session_player_id,round_index,target,phase,dart_hit,points)
    values(p_session,p_player,(p_event->>'round_index')::int,(p_event->>'target')::int,p_event->>'phase',(p_event->>'dart_hit')::int,(p_event->>'points')::int);
  update public.doubles_practice_players set round_index=(p_player_patch->>'round_index')::int,current_target=(p_player_patch->>'current_target')::int,
    phase=p_player_patch->>'phase',score=(p_player_patch->>'score')::int,hits=(p_player_patch->>'hits')::int,
    first_dart_hits=(p_player_patch->>'first_dart_hits')::int where id=p_player and session_id=p_session;
  update public.doubles_practice_sessions set current_slot=(p_patch->>'current_slot')::int,revision=revision+1 where id=p_session;
 end if;
 cached := jsonb_build_object('ok',true);
 insert into public.wgd_commands(request_id,game_id,result) values(p_request,p_session,cached);
 return cached;
end;
$$;
revoke all on function public.wgd_drill_command(text,uuid,uuid,bigint,uuid,jsonb,jsonb,uuid,jsonb) from public,anon,authenticated;
grant execute on function public.wgd_drill_command(text,uuid,uuid,bigint,uuid,jsonb,jsonb,uuid,jsonb) to service_role;

-- Aggregate each leg once, then roll up players and teams. These views are
-- server-only; callers use the authenticated server actions or export routes.
alter table public.scoring_events add column if not exists thrower text not null default 'west_green';
create or replace view public.player_leg_stats_view as
select g.west_green_player_id as player_id, count(*) as legs_played,
 count(*) filter (where g.winner='west_green') as legs_won
from public.games g where g.status='completed' and not g.deleted group by g.west_green_player_id;

create or replace view public.score_buckets_view as
select e.game_id, e.team_id,
 count(*) filter(where e.score>=60) as sixty_plus,
 count(*) filter(where e.score>=80) as eighty_plus,
 count(*) filter(where e.score>=100) as hundred_plus,
 count(*) filter(where e.score>=120) as hundred_twenty_plus,
 count(*) filter(where e.score>=140) as hundred_forty_plus,
 count(*) filter(where e.score>=170) as hundred_seventy_plus,
 count(*) filter(where e.score=180) as one_eighties
from public.scoring_events e join public.games g on g.id=e.game_id
where not e.is_deleted and not e.is_bust and not g.deleted and e.thrower='west_green'
group by e.game_id,e.team_id;

create or replace view public.player_stats_view as
with legs as (
 select g.id,g.west_green_player_id,g.winner,
  coalesce(sum(case when e.is_bust then 0 else e.score end),0) as points,
  coalesce(sum(e.darts),0) as darts,
  max(e.score) filter(where e.is_checkout) as high_finish,
  count(*) filter(where e.is_checkout) as hits,
  count(*) filter(where (case when e.is_bust then e.remaining_after else e.remaining_after+e.score end)
   between 2 and 170 and (case when e.is_bust then e.remaining_after else e.remaining_after+e.score end) not in (159,162,163,165,166,168,169)) as attempts
 from public.games g left join public.scoring_events e on e.game_id=g.id and not e.is_deleted and e.thrower='west_green'
 where g.status='completed' and not g.deleted group by g.id
)
select p.id as player_id,p.name,count(l.id) as legs_played,
 count(l.id) filter(where l.winner='west_green') as legs_won,
 sum(l.points)::numeric/nullif(sum(l.darts),0)*3 as three_dart_avg,
 max(l.high_finish) as high_finish,
 sum(l.hits)::numeric/nullif(sum(l.attempts),0)*100 as checkout_pct
from public.players p left join legs l on l.west_green_player_id=p.id group by p.id,p.name;

create or replace view public.team_stats_view as
with legs as (
 select g.id,g.team_id,g.winner,
  coalesce(sum(case when e.is_bust then 0 else e.score end),0) as points,
  coalesce(sum(e.darts),0) as darts,max(e.score) filter(where e.is_checkout) as high_finish
 from public.games g left join public.scoring_events e on e.game_id=g.id and not e.is_deleted and e.thrower='west_green'
 where g.status='completed' and not g.deleted group by g.id
)
select team_id,count(*) as legs_played,count(*) filter(where winner='west_green') as legs_won,
 sum(points)::numeric/nullif(sum(darts),0)*3 as three_dart_avg,max(high_finish) as high_finish
from legs group by team_id;

revoke all on public.player_leg_stats_view,public.score_buckets_view,public.player_stats_view,public.team_stats_view from anon,authenticated;
grant select on public.player_leg_stats_view,public.score_buckets_view,public.player_stats_view,public.team_stats_view to service_role;


-- The application uses a verified team session and server-side service-role
-- access. No public client reads/writes are needed. Never expose that key.
do $$
declare t text;
begin
 foreach t in array array['teams','pins','players','seasons','fixtures','games','scoring_events',
 'practice_sessions','practice_games','practice_events','game_121_sessions','game_121_turns',
 'checkout_practice_sessions','checkout_practice_attempts','doubles_practice_sessions',
 'doubles_practice_players','doubles_practice_attempts'] loop
  if to_regclass('public.'||t) is not null then
   execute format('alter table public.%I enable row level security',t);
   execute format('revoke all on public.%I from anon, authenticated',t);
   execute format('grant all on public.%I to service_role',t);
  end if;
 end loop;
end $$;
grant usage,select on all sequences in schema public to service_role;

commit;
