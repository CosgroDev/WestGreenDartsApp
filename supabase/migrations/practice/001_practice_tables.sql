-- Practice module tables
create table if not exists practice_sessions (
  id uuid primary key default gen_random_uuid(),
  team_id uuid not null,
  player_a_id uuid null references players(id) on delete set null,
  player_b_id uuid null references players(id) on delete set null,
  legs_to_play int not null default 1,
  start_score int not null default 501,
  status text not null default 'in_progress', -- in_progress | completed | cancelled
  created_at timestamptz not null default now(),
  completed_at timestamptz null
);

create table if not exists practice_games (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references practice_sessions(id) on delete cascade,
  leg_index int not null,
  winner text null, -- player_a | player_b
  darts_thrown int null,
  high_finish int null,
  first_nine_avg numeric null,
  three_dart_avg numeric null,
  status text not null default 'in_progress', -- in_progress | completed | deleted
  created_at timestamptz not null default now(),
  completed_at timestamptz null
);
create index if not exists practice_games_session_idx on practice_games(session_id);

create table if not exists practice_events (
  id bigserial primary key,
  session_id uuid not null references practice_sessions(id) on delete cascade,
  game_id uuid not null references practice_games(id) on delete cascade,
  throw_index int not null,
  score int not null,
  darts int not null,
  remaining_after int not null,
  is_bust boolean not null default false,
  is_checkout boolean not null default false,
  is_deleted boolean not null default false,
  created_at timestamptz not null default now()
);
create index if not exists practice_events_game_idx on practice_events(game_id) where is_deleted = false;
create index if not exists practice_events_session_idx on practice_events(session_id) where is_deleted = false;

-- basic status constraint
alter table practice_sessions drop constraint if exists practice_sessions_status_check;
alter table practice_sessions add constraint practice_sessions_status_check
  check (status in ('in_progress','completed','cancelled'));

alter table practice_games drop constraint if exists practice_games_status_check;
alter table practice_games add constraint practice_games_status_check
  check (status in ('in_progress','completed','deleted'));
