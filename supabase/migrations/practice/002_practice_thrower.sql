-- Add thrower column to practice_events to track which side threw
alter table practice_events add column if not exists thrower text null; -- expected values: player_a | player_b
