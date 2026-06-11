-- 121 base-target mode toggle
-- Default (false): classic rules — base only locks when you finish on Turn 1.
-- When true: base target advances by one every time you finish within 9 darts
-- (any of the 3 turns), not just on a Turn 1 finish.

alter table game_121_sessions
  add column if not exists advance_base_on_any_finish boolean not null default false;
