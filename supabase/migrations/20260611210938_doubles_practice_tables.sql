-- Doubles Switch — multi-player doubles finishing practice.
create table if not exists doubles_practice_sessions (
  id uuid primary key default gen_random_uuid(),
  team_id uuid not null,
  current_slot int not null default 0,
  status text not null default 'in_progress',
  created_at timestamptz not null default now(),
  completed_at timestamptz null
);

create table if not exists doubles_practice_players (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references doubles_practice_sessions(id) on delete cascade,
  player_id uuid references players(id) on delete set null,
  throw_order int not null,
  round_index int not null default 0,
  current_target int not null default 10,
  phase text not null default 'sequence',
  score int not null default 0,
  hits int not null default 0,
  first_dart_hits int not null default 0
);

create table if not exists doubles_practice_attempts (
  id bigserial primary key,
  session_id uuid not null references doubles_practice_sessions(id) on delete cascade,
  session_player_id uuid not null references doubles_practice_players(id) on delete cascade,
  round_index int not null,
  target int not null,
  phase text not null,
  dart_hit int not null,
  points int not null default 0,
  created_at timestamptz not null default now()
);

create index if not exists doubles_practice_players_session_idx on doubles_practice_players(session_id);
create index if not exists doubles_practice_attempts_session_idx on doubles_practice_attempts(session_id);
create index if not exists doubles_practice_attempts_player_idx on doubles_practice_attempts(session_player_id);;
