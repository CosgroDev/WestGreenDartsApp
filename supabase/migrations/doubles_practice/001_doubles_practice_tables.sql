-- Doubles Switch — multi-player doubles finishing practice.
-- One session holds many players; each player progresses through the doubles
-- sequence independently and scores points per visit. Competitive: a winner is
-- decided by total score.

create table if not exists doubles_practice_sessions (
  id uuid primary key default gen_random_uuid(),
  team_id uuid not null,
  current_slot int not null default 0,          -- whose turn (index into throw_order)
  status text not null default 'in_progress',   -- in_progress | completed | abandoned
  created_at timestamptz not null default now(),
  completed_at timestamptz null
);

create table if not exists doubles_practice_players (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references doubles_practice_sessions(id) on delete cascade,
  player_id uuid references players(id) on delete set null,
  throw_order int not null,                      -- 0-based position in rotation
  round_index int not null default 0,            -- attempts completed by this player
  current_target int not null default 10,        -- double currently being thrown at
  phase text not null default 'sequence',        -- sequence | random
  score int not null default 0,
  hits int not null default 0,                   -- visits where the double was hit
  first_dart_hits int not null default 0         -- visits hit with the first dart
);

create table if not exists doubles_practice_attempts (
  id bigserial primary key,
  session_id uuid not null references doubles_practice_sessions(id) on delete cascade,
  session_player_id uuid not null references doubles_practice_players(id) on delete cascade,
  round_index int not null,
  target int not null,                           -- the double (e.g. 10 = D10)
  phase text not null,                           -- sequence | random
  dart_hit int not null,                         -- 0 = missed all 3, else 1|2|3
  points int not null default 0,
  created_at timestamptz not null default now()
);

create index if not exists doubles_practice_players_session_idx on doubles_practice_players(session_id);
create index if not exists doubles_practice_attempts_session_idx on doubles_practice_attempts(session_id);
create index if not exists doubles_practice_attempts_player_idx on doubles_practice_attempts(session_player_id);
