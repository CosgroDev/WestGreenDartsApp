-- Give each match (a set of legs between one West Green player and one named
-- opponent within a fixture) a stable id, so two separate matches that happen
-- to share a player and opponent name no longer merge into one on the fixture
-- page, and deleting a match targets exactly its own legs.
alter table games add column if not exists match_id uuid;

-- Backfill: one match id per existing (fixture, player, opponent-name) group,
-- mirroring the grouping the fixture page has used until now.
with groups as (
  select fixture_id,
         west_green_player_id,
         lower(btrim(opponent_player)) as opp_key,
         gen_random_uuid() as mid
  from games
  where match_id is null
  group by fixture_id, west_green_player_id, lower(btrim(opponent_player))
)
update games g
   set match_id = groups.mid
  from groups
 where g.match_id is null
   and g.fixture_id is not distinct from groups.fixture_id
   and g.west_green_player_id is not distinct from groups.west_green_player_id
   and lower(btrim(g.opponent_player)) = groups.opp_key;

create index if not exists games_match_idx on games (match_id);

-- Soft-delete phantom legs: in-progress legs with no live visits whose match
-- already has two completed legs. These were created by the pre-fix scoring
-- client when it lost track of the leg count after a mid-match reload.
update games g
   set deleted = true
 where g.status = 'in_progress'
   and g.deleted = false
   and not exists (
     select 1 from scoring_events se
      where se.game_id = g.id and se.is_deleted = false
   )
   and (
     select count(*) from games l
      where l.match_id = g.match_id
        and l.deleted = false
        and l.status = 'completed'
   ) >= 2;
