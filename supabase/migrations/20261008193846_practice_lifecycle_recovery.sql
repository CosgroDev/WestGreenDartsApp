begin;
alter table public.practice_sessions add column if not exists solo_mode boolean not null default false;
alter table public.doubles_practice_sessions add column if not exists end_after_round boolean not null default false;
create table if not exists public.wgd_drill_history (
 id bigserial primary key, session_id uuid not null, mode text not null, request_id uuid not null unique,
 prior_session jsonb not null, prior_players jsonb not null default '[]', event_id bigint,
 active boolean not null default true
);
alter table public.wgd_drill_history enable row level security;
revoke all on public.wgd_drill_history from public, anon, authenticated;
grant all on public.wgd_drill_history to service_role;
grant usage,select on sequence public.wgd_drill_history_id_seq to service_role;
create or replace function public.wgd_drill_command_base(
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

revoke all on function public.wgd_drill_command_base(text,uuid,uuid,bigint,uuid,jsonb,jsonb,uuid,jsonb) from public,anon,authenticated;
grant execute on function public.wgd_drill_command_base(text,uuid,uuid,bigint,uuid,jsonb,jsonb,uuid,jsonb) to service_role;
create or replace function public.wgd_drill_command(
 p_mode text,p_session uuid,p_team uuid,p_revision bigint,p_request uuid,p_event jsonb,p_patch jsonb,
 p_player uuid default null,p_player_patch jsonb default null
) returns jsonb language plpgsql set search_path='' as $$
declare s jsonb; saved jsonb; players jsonb; h public.wgd_drill_history; t text; eid bigint; e jsonb;
begin
 t:=case p_mode when '121' then 'game_121_sessions' when 'checkout' then 'checkout_practice_sessions' when 'doubles' then 'doubles_practice_sessions' end;
 if t is null or p_team is null or p_request is null then raise exception 'Invalid command'; end if;
 execute format('select to_jsonb(s) from public.%I s where id=$1 and team_id=$2 for update',t) into s using p_session,p_team;
 if s is null then raise exception 'Session not found'; end if;
 select result into saved from public.wgd_commands where request_id=p_request and game_id=p_session;
 if saved is not null then return saved; end if;
 if p_revision is null or p_revision<>(s->>'revision')::bigint then raise exception 'Session changed on another device. Reload before scoring again.'; end if;
 if p_patch->>'command'='undo' then
  select * into h from public.wgd_drill_history where session_id=p_session and mode=p_mode and active order by id desc limit 1;
  if h.id is null then
   -- Existing sessions have event history but predate snapshots. Recover their
   -- last visit from its persisted before-state, or reopen a manually ended game.
   h.prior_session:=s||jsonb_build_object('status','in_progress','completed_at',null);
   if s->>'status' in ('completed','abandoned') then h.event_id:=null;
   elsif p_mode='121' then
    select to_jsonb(x) into e from public.game_121_turns x where session_id=p_session order by id desc limit 1;
    h.prior_session:=h.prior_session||jsonb_build_object('base_checkout',e->'base_checkout','current_checkout',e->'checkout','current_turn',e->'turn_number','remaining',e->'remaining_before');
   elsif p_mode='checkout' then
    select to_jsonb(x) into e from public.checkout_practice_attempts x where session_id=p_session order by id desc limit 1;
    h.prior_session:=h.prior_session||jsonb_build_object('current_target',e->'target','attempt_index',(s->>'attempt_index')::int-1);
   else
    select to_jsonb(x) into e from public.doubles_practice_attempts x where session_id=p_session order by id desc limit 1;
   end if;
   if p_mode='doubles' then
    select coalesce(jsonb_agg(case when p.id=(e->>'session_player_id')::uuid then to_jsonb(p)||jsonb_build_object(
      'round_index',e->'round_index','current_target',e->'target','phase',e->'phase','score',p.score-(e->>'points')::int,
      'hits',p.hits-case when (e->>'dart_hit')::int>0 then 1 else 0 end,'first_dart_hits',p.first_dart_hits-case when (e->>'dart_hit')::int=1 then 1 else 0 end)
      else to_jsonb(p) end),'[]') into h.prior_players from public.doubles_practice_players p where session_id=p_session;
    if e is not null then h.prior_session:=h.prior_session||jsonb_build_object('current_slot',(select throw_order from public.doubles_practice_players where id=(e->>'session_player_id')::uuid),'end_after_round',false); end if;
   end if;
   if e is null and s->>'status'='in_progress' then raise exception 'There is no saved action to undo for this session.'; end if;
   h.event_id:=(e->>'id')::bigint;
  end if;
  if p_mode='121' then
   delete from public.game_121_turns where id=h.event_id and session_id=p_session;
   update public.game_121_sessions set base_checkout=(h.prior_session->>'base_checkout')::int,current_checkout=(h.prior_session->>'current_checkout')::int,
    current_turn=(h.prior_session->>'current_turn')::int,remaining=(h.prior_session->>'remaining')::int,status=h.prior_session->>'status',completed_at=(h.prior_session->>'completed_at')::timestamptz,revision=revision+1 where id=p_session;
  elsif p_mode='checkout' then
   delete from public.checkout_practice_attempts where id=h.event_id and session_id=p_session;
   update public.checkout_practice_sessions set current_target=(h.prior_session->>'current_target')::int,attempt_index=(h.prior_session->>'attempt_index')::int,
    status=h.prior_session->>'status',completed_at=(h.prior_session->>'completed_at')::timestamptz,revision=revision+1 where id=p_session;
  else
   delete from public.doubles_practice_attempts where id=h.event_id and session_id=p_session;
   update public.doubles_practice_players p set round_index=(j->>'round_index')::int,current_target=(j->>'current_target')::int,phase=j->>'phase',score=(j->>'score')::int,hits=(j->>'hits')::int,first_dart_hits=(j->>'first_dart_hits')::int
    from jsonb_array_elements(h.prior_players) j where p.id=(j->>'id')::uuid and p.session_id=p_session;
   update public.doubles_practice_sessions set current_slot=(h.prior_session->>'current_slot')::int,end_after_round=coalesce((h.prior_session->>'end_after_round')::boolean,false),
    status=h.prior_session->>'status',completed_at=(h.prior_session->>'completed_at')::timestamptz,revision=revision+1 where id=p_session;
  end if;
  update public.wgd_drill_history set active=false where id=h.id;
  saved:=jsonb_build_object('ok',true);
  insert into public.wgd_commands(request_id,game_id,result) values(p_request,p_session,saved);
  return saved;
 end if;
 if p_mode='doubles' then select coalesce(jsonb_agg(to_jsonb(p)),'[]') into players from public.doubles_practice_players p where session_id=p_session; end if;
 -- Finish the current round by default so every player has equal visits.
 if p_mode='doubles' and p_event is null and p_patch->>'status'='completed' and (s->>'current_slot')::int<>0 and coalesce((p_patch->>'immediate')::boolean,false)=false then
  if s->>'status'<>'in_progress' then raise exception 'Session is no longer active'; end if;
  update public.doubles_practice_sessions set end_after_round=true,revision=revision+1 where id=p_session;
  saved:=jsonb_build_object('ok',true,'finishing_round',true);
  insert into public.wgd_commands(request_id,game_id,result) values(p_request,p_session,saved);
 else
  saved:=public.wgd_drill_command_base(p_mode,p_session,p_team,p_revision,p_request,p_event,p_patch,p_player,p_player_patch);
  if p_mode='doubles' and p_event is not null and (s->>'end_after_round')::boolean and (p_patch->>'current_slot')::int=0 then
   update public.doubles_practice_sessions set status='completed',completed_at=now(),end_after_round=false where id=p_session;
  end if;
 end if;
 if p_event is not null then
  if p_mode='121' then select max(id) into eid from public.game_121_turns where session_id=p_session;
  elsif p_mode='checkout' then select max(id) into eid from public.checkout_practice_attempts where session_id=p_session;
  else select max(id) into eid from public.doubles_practice_attempts where session_id=p_session; end if;
 end if;
 insert into public.wgd_drill_history(session_id,mode,request_id,prior_session,prior_players,event_id) values(p_session,p_mode,p_request,s,coalesce(players,'[]'),eid);
 return saved;
end; $$;
revoke all on function public.wgd_drill_command(text,uuid,uuid,bigint,uuid,jsonb,jsonb,uuid,jsonb) from public,anon,authenticated;
grant execute on function public.wgd_drill_command(text,uuid,uuid,bigint,uuid,jsonb,jsonb,uuid,jsonb) to service_role;
-- Empty successor legs can undo the previous checkout under the same parent lock.
create or replace function public.wgd_score_command_state(
 p_game uuid,p_team uuid,p_revision bigint,p_request uuid,p_practice boolean,p_command text,
 p_side text default 'west_green',p_score integer default 0,p_darts integer default 3
) returns jsonb language plpgsql set search_path='' as $$
declare response jsonb; g jsonb; previous uuid; parent uuid; previous_revision bigint; canonical uuid:=p_game; sess jsonb;
begin
 select c.result into response from public.wgd_commands c where request_id=p_request and game_id=p_game;
 if response is not null then
  canonical:=coalesce((response->>'reopened_game_id')::uuid,p_game);
  return response||jsonb_build_object('state',public.wgd_score_snapshot(canonical,p_team,p_practice));
 end if;
 if p_practice then
  select session_id into parent from public.practice_games where id=p_game;
  select to_jsonb(s) into sess from public.practice_sessions s where id=parent and team_id=p_team for update;
  if sess is null then raise exception 'Session not found'; end if;
  select to_jsonb(pg) into g from public.practice_games pg where id=p_game for update;
 else
  select fixture_id into parent from public.games where id=p_game and team_id=p_team;
  perform 1 from public.fixtures where id=parent and team_id=p_team for update;
  if not found then raise exception 'Fixture not found'; end if;
  select to_jsonb(lg) into g from public.games lg where id=p_game for update;
 end if;
 if g is null or coalesce((g->>'deleted')::boolean,false) then raise exception 'Game not found'; end if;
 if p_revision is null or p_revision<>(g->>'revision')::bigint then raise exception 'The score changed on another device. Reload before scoring again.'; end if;
 if p_practice and p_command='record' and (sess->>'solo_mode')::boolean and p_side<>'player_a' then raise exception 'This is a solo session'; end if;
 if p_command='undo' then
  if p_practice and not exists(select 1 from public.practice_events where game_id=p_game and not is_deleted) then
   select id,revision into previous,previous_revision from public.practice_games where session_id=parent and leg_index=(g->>'leg_index')::int-1 and status='completed' for update;
  elsif not p_practice and not exists(select 1 from public.scoring_events where game_id=p_game and not is_deleted) then
   select id,revision into previous,previous_revision from public.games where fixture_id=parent and match_id=(g->>'match_id')::uuid and not deleted and created_at<(g->>'created_at')::timestamptz and status='completed' order by created_at desc limit 1 for update;
  end if;
 end if;
 if previous is not null then
  response:=public.wgd_score_command(previous,p_team,previous_revision,p_request,p_practice,'undo',p_side,p_score,p_darts);
  canonical:=previous;
  response:=response||jsonb_build_object('reopened_game_id',previous);
  update public.wgd_commands set result=jsonb_build_object('ok',true,'undidThrower',response->>'undidThrower','reopened_game_id',previous),game_id=p_game where request_id=p_request;
 else
  response:=public.wgd_score_command(p_game,p_team,p_revision,p_request,p_practice,p_command,p_side,p_score,p_darts);
 end if;
 return response||jsonb_build_object('state',public.wgd_score_snapshot(canonical,p_team,p_practice));
end; $$;
revoke all on function public.wgd_score_command_state(uuid,uuid,bigint,uuid,boolean,text,text,integer,integer) from public,anon,authenticated;
grant execute on function public.wgd_score_command_state(uuid,uuid,bigint,uuid,boolean,text,text,integer,integer) to service_role;
create or replace function public.wgd_end_practice(p_game uuid,p_team uuid,p_revision bigint,p_request uuid,p_undo boolean default false)
returns jsonb language plpgsql set search_path='' as $$
declare g public.practice_games; s public.practice_sessions; cached jsonb;
begin
 select * into s from public.practice_sessions where id=(select session_id from public.practice_games where id=p_game) and team_id=p_team for update;
 if s.id is null then raise exception 'Session not found'; end if;
 select * into g from public.practice_games where id=p_game for update;
 select result into cached from public.wgd_commands where request_id=p_request and game_id=p_game;
 if cached is not null then return cached||jsonb_build_object('state',public.wgd_score_snapshot(p_game,p_team,true)); end if;
 if p_request is null or p_revision is null or g.revision<>p_revision then raise exception 'The score changed on another device. Reload before scoring again.'; end if;
 if (p_undo and s.status<>'cancelled') or (not p_undo and s.status<>'in_progress') then raise exception 'Session is no longer active'; end if;
 update public.practice_sessions set status=case when p_undo then 'in_progress' else 'cancelled' end,completed_at=case when p_undo then null else now() end where id=s.id;
 update public.practice_games set revision=revision+1 where id=p_game;
 cached:=jsonb_build_object('ok',true);
 insert into public.wgd_commands(request_id,game_id,result) values(p_request,p_game,cached);
 return cached||jsonb_build_object('state',public.wgd_score_snapshot(p_game,p_team,true));
end; $$;
revoke all on function public.wgd_end_practice(uuid,uuid,bigint,uuid,boolean) from public,anon,authenticated;
grant execute on function public.wgd_end_practice(uuid,uuid,bigint,uuid,boolean) to service_role;
commit;
