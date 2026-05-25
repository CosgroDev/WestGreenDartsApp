-- 121 checkout progression game tables
-- One session = one attempt to progress from checkout 121 → 170

create table if not exists game_121_sessions (
  id uuid primary key default gen_random_uuid(),
  team_id uuid not null,
  player_id uuid references players(id) on delete set null,
  base_checkout int not null default 121,       -- locked base (only moves on Turn 1 finish)
  current_checkout int not null default 121,    -- target currently being attempted
  current_turn int not null default 1,          -- 1, 2, or 3
  remaining int not null default 121,           -- score left on current checkout
  status text not null default 'in_progress',   -- in_progress | won
  created_at timestamptz not null default now(),
  completed_at timestamptz null
);

create table if not exists game_121_turns (
  id bigserial primary key,
  session_id uuid not null references game_121_sessions(id) on delete cascade,
  checkout int not null,
  base_checkout int not null,
  turn_number int not null,
  score int not null,
  remaining_before int not null,
  remaining_after int not null,
  is_bust bool not null default false,
  result text null, -- locked | progressed | failed | won | null (mid-attempt)
  created_at timestamptz not null default now()
);

create index if not exists game_121_turns_session_idx on game_121_turns(session_id);
