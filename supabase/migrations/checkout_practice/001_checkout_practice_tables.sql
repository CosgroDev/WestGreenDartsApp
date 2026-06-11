-- Random Checkout — single-player practice. Serves a random finishable checkout
-- (2–170) and records whether the player finished and in how many darts.

create table if not exists checkout_practice_sessions (
  id uuid primary key default gen_random_uuid(),
  team_id uuid not null,
  player_id uuid references players(id) on delete set null,
  current_target int not null,                   -- checkout currently being attempted
  attempt_index int not null default 0,          -- attempts completed
  status text not null default 'in_progress',    -- in_progress | completed | abandoned
  created_at timestamptz not null default now(),
  completed_at timestamptz null
);

create table if not exists checkout_practice_attempts (
  id bigserial primary key,
  session_id uuid not null references checkout_practice_sessions(id) on delete cascade,
  target int not null,
  darts_used int not null default 0,             -- 1–3 when success, else 0
  success bool not null default false,
  created_at timestamptz not null default now()
);

create index if not exists checkout_practice_attempts_session_idx on checkout_practice_attempts(session_id);
