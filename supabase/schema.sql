-- West Green Darts schema (v0.1)
-- Designed for single-team v1; keep team_id to ease future multi-team.

create table if not exists teams (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  created_at timestamptz not null default now()
);

create table if not exists pins (
  id uuid primary key default gen_random_uuid(),
  team_id uuid references teams(id) on delete cascade,
  pin_hash text not null,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  rotated_at timestamptz
);

create table if not exists players (
  id uuid primary key default gen_random_uuid(),
  team_id uuid references teams(id) on delete cascade,
  name text not null unique,
  photo_url text,
  dart_model text,
  stem_length text,
  flight_type text,
  registration_date date not null default current_date,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists seasons (
  id uuid primary key default gen_random_uuid(),
  team_id uuid references teams(id) on delete cascade,
  name text not null, -- format "YY/YY"
  is_current boolean not null default false,
  created_at timestamptz not null default now()
);

create table if not exists fixtures (
  id uuid primary key default gen_random_uuid(),
  team_id uuid references teams(id) on delete cascade,
  season_id uuid references seasons(id) on delete cascade,
  starts_at timestamptz not null,
  home boolean not null,
  opponent text not null,
  venue text,
  notes text,
  created_at timestamptz not null default now()
);

create table if not exists games (
  id uuid primary key default gen_random_uuid(),
  team_id uuid references teams(id) on delete cascade,
  fixture_id uuid references fixtures(id) on delete cascade,
  west_green_player_id uuid references players(id),
  opponent_player text not null,
  west_green_starts boolean not null,
  status text not null default 'in_progress', -- in_progress | completed | void
  winner text check (winner in ('west_green','opponent')) ,
  darts_thrown integer,
  deleted boolean not null default false,
  created_at timestamptz not null default now(),
  completed_at timestamptz
);

create table if not exists scoring_events (
  id bigserial primary key,
  team_id uuid references teams(id) on delete cascade,
  game_id uuid references games(id) on delete cascade,
  throw_index integer not null, -- visit number (1-based)
  score integer not null check (score between 0 and 180),
  darts integer not null check (darts between 1 and 3),
  remaining_after integer not null check (remaining_after between 0 and 501),
  is_bust boolean not null default false,
  is_checkout boolean not null default false,
  created_at timestamptz not null default now(),
  is_deleted boolean not null default false
);

-- Materialized/stat views placeholders (to be fleshed out)
create view player_leg_stats_view as
select
  g.west_green_player_id as player_id,
  count(*) filter (where g.status = 'completed') as legs_played,
  count(*) filter (where g.status = 'completed' and g.winner = 'west_green') as legs_won
from games g
where g.status = 'completed'
group by g.west_green_player_id;

create view score_buckets_view as
select
  se.game_id,
  se.team_id,
  count(*) filter (where score >= 60) as sixty_plus,
  count(*) filter (where score >= 80) as eighty_plus,
  count(*) filter (where score >= 100) as hundred_plus,
  count(*) filter (where score >= 120) as hundred_twenty_plus,
  count(*) filter (where score >= 140) as hundred_forty_plus,
  count(*) filter (where score >= 170) as hundred_seventy_plus,
  count(*) filter (where score = 180) as one_eighties
from scoring_events se
where se.is_deleted = false
group by se.game_id, se.team_id;

-- Player averages and checkout rates
create view player_stats_view as
select
  p.id as player_id,
  p.name,
  count(g.id) filter (where g.status = 'completed') as legs_played,
  count(g.id) filter (where g.status = 'completed' and g.winner = 'west_green') as legs_won,
  avg( (501 - min(se.remaining_after))::numeric / nullif(sum(se.darts),0) * 3 ) filter (where g.status='completed') as three_dart_avg,
  max(501 - se.remaining_after) filter (where se.is_checkout) as high_finish,
  sum(case when se.is_checkout then 1 else 0 end)::numeric / nullif(count(case when se.remaining_after<=170 then 1 end),0) * 100 as checkout_pct
from players p
left join games g on g.west_green_player_id = p.id
left join scoring_events se on se.game_id = g.id and se.is_deleted = false
group by p.id, p.name;

create view team_stats_view as
select
  g.team_id,
  count(*) filter (where g.status='completed') as legs_played,
  count(*) filter (where g.status='completed' and g.winner='west_green') as legs_won,
  avg( (501 - min(se.remaining_after))::numeric / nullif(sum(se.darts),0) * 3 ) as three_dart_avg,
  max(501 - se.remaining_after) filter (where se.is_checkout) as high_finish
from games g
left join scoring_events se on se.game_id = g.id and se.is_deleted = false
group by g.team_id;

-- Indexes for speed
create index if not exists scoring_events_game_idx on scoring_events (game_id, throw_index);
create index if not exists scoring_events_team_idx on scoring_events (team_id);
create index if not exists games_fixture_idx on games (fixture_id);
