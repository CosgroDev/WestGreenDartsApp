-- Random Checkout — single-player finishing practice.
create table if not exists checkout_practice_sessions (
  id uuid primary key default gen_random_uuid(),
  team_id uuid not null,
  player_id uuid references players(id) on delete set null,
  current_target int not null,
  attempt_index int not null default 0,
  status text not null default 'in_progress',
  created_at timestamptz not null default now(),
  completed_at timestamptz null
);

create table if not exists checkout_practice_attempts (
  id bigserial primary key,
  session_id uuid not null references checkout_practice_sessions(id) on delete cascade,
  target int not null,
  darts_used int not null default 0,
  success bool not null default false,
  created_at timestamptz not null default now()
);

create index if not exists checkout_practice_attempts_session_idx on checkout_practice_attempts(session_id);;
