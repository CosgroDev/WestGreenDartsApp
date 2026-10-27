-- Store each player's AI season insight so it is generated on demand and read
-- back the rest of the time. `legs_covered` records how many completed legs
-- the insight analysed, so the leaderboard can show when it is out of date
-- (the player has played since) and offer a refresh.
create table if not exists player_ai_insights (
  player_id uuid not null references players(id) on delete cascade,
  season_id uuid not null references seasons(id) on delete cascade,
  summary text not null,
  generated_at timestamptz not null default now(),
  legs_covered int not null,
  primary key (player_id, season_id)
);
alter table player_ai_insights enable row level security;
revoke all on player_ai_insights from anon, authenticated;
grant all on player_ai_insights to service_role;
