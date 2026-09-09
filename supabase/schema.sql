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
  match_id uuid, -- legs of the same match share this id
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
  thrower text not null default 'west_green',
  throw_index integer not null, -- visit number (1-based)
  score integer not null check (score between 0 and 180),
  darts integer not null check (darts between 1 and 3),
  remaining_after integer not null check (remaining_after between 0 and 501),
  is_bust boolean not null default false,
  is_checkout boolean not null default false,
  created_at timestamptz not null default now(),
  is_deleted boolean not null default false
);

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

-- Indexes for speed
create index if not exists scoring_events_game_idx on scoring_events (game_id, throw_index);
create index if not exists scoring_events_team_idx on scoring_events (team_id);
create index if not exists games_fixture_idx on games (fixture_id);
