begin;
-- Share the parent's lock with scoring commands so one response always carries
-- a coherent revision, both scores, turn, match score and completed-leg history.
create or replace function public.wgd_score_snapshot(
  p_game uuid, p_team uuid, p_practice boolean default false
) returns jsonb language plpgsql set search_path = '' as $$
declare
  parent_id uuid; g jsonb; sess jsonb; events jsonb; completed_legs jsonb;
  mid uuid; player_id uuid; opponent_name text; west integer; opp integer; next_game uuid;
begin
  if p_team is null then raise exception 'Team required'; end if;
  if p_practice then
    select pg.session_id into parent_id from public.practice_games pg where pg.id=p_game;
    select to_jsonb(s) into sess from public.practice_sessions s where s.id=parent_id and s.team_id=p_team for update;
    if sess is null then raise exception 'Session not found'; end if;
    select to_jsonb(pg) into g from public.practice_games pg where pg.id=p_game for update;
    if g is null then raise exception 'Game not found'; end if;
    sess := sess || jsonb_build_object(
      'player_a', (select jsonb_build_object('name',p.name) from public.players p where p.id=(sess->>'player_a_id')::uuid),
      'player_b', (select jsonb_build_object('name',p.name) from public.players p where p.id=(sess->>'player_b_id')::uuid)
    );
    g := g || jsonb_build_object('practice_sessions',sess);
    select coalesce(jsonb_agg(to_jsonb(e)-'request_id'-'team_id' order by e.throw_index,e.id),'[]'::jsonb)
      into events from public.practice_events e where e.game_id=p_game and not e.is_deleted;
    return jsonb_build_object('ok',true,'meta',g,'events',events);
  end if;
  select lg.fixture_id into parent_id from public.games lg where lg.id=p_game and lg.team_id=p_team and not lg.deleted;
  perform 1 from public.fixtures f where f.id=parent_id and f.team_id=p_team for update;
  if not found then raise exception 'Fixture not found'; end if;
  select to_jsonb(lg)-'ai_review'-'ai_review_at' into g from public.games lg where lg.id=p_game and lg.team_id=p_team and not lg.deleted for update;
  if g is null then raise exception 'Game not found'; end if;
  mid := (g->>'match_id')::uuid; player_id := (g->>'west_green_player_id')::uuid; opponent_name := g->>'opponent_player';
  select coalesce(jsonb_agg(to_jsonb(e)-'request_id'-'team_id' order by e.throw_index,e.id),'[]'::jsonb)
    into events from public.scoring_events e where e.game_id=p_game and not e.is_deleted;
  select coalesce(jsonb_agg(jsonb_build_object(
    'id',lg.id,'winner',lg.winner,
    'events',(select coalesce(jsonb_agg(to_jsonb(e)-'request_id'-'team_id' order by e.throw_index,e.id),'[]'::jsonb)
      from public.scoring_events e where e.game_id=lg.id and not e.is_deleted and e.thrower='west_green')
  ) order by lg.completed_at,lg.id),'[]'::jsonb),
    count(*) filter(where lg.winner='west_green'),count(*) filter(where lg.winner='opponent')
    into completed_legs,west,opp
    from public.games lg where lg.team_id=p_team and not lg.deleted and lg.status='completed'
      and ((mid is not null and lg.match_id=mid) or (mid is null and lg.fixture_id=parent_id and
        lg.west_green_player_id is not distinct from player_id and lg.opponent_player=opponent_name));
  if g->>'status'='completed' and mid is not null then
    select lg.id into next_game from public.games lg where lg.match_id=mid and not lg.deleted
      and lg.status='in_progress' order by lg.created_at,lg.id limit 1;
  end if;
  g := g || jsonb_build_object(
    'players',(select jsonb_build_object('name',p.name) from public.players p where p.id=player_id),
    'legs',jsonb_build_object('west',west,'opp',opp),'nextGameId',next_game
  );
  return jsonb_build_object('ok',true,'meta',g,'events',events,'completedLegs',completed_legs);
end;
$$;
create or replace function public.wgd_score_command_state(
  p_game uuid,p_team uuid,p_revision bigint,p_request uuid,p_practice boolean,p_command text,
  p_side text default 'west_green',p_score integer default 0,p_darts integer default 3
) returns jsonb language plpgsql set search_path = '' as $$
declare command_result jsonb;
begin
  command_result := public.wgd_score_command(p_game,p_team,p_revision,p_request,p_practice,p_command,p_side,p_score,p_darts);
  return command_result || jsonb_build_object('state',public.wgd_score_snapshot(p_game,p_team,p_practice));
end;
$$;
revoke all on function public.wgd_score_snapshot(uuid,uuid,boolean) from public,anon,authenticated;
grant execute on function public.wgd_score_snapshot(uuid,uuid,boolean) to service_role;
revoke all on function public.wgd_score_command_state(uuid,uuid,bigint,uuid,boolean,text,text,integer,integer) from public,anon,authenticated;
grant execute on function public.wgd_score_command_state(uuid,uuid,bigint,uuid,boolean,text,text,integer,integer) to service_role;
commit;
