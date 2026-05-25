-- Add team_id to practice_events (was missing from initial migration)
alter table practice_events add column if not exists team_id uuid null references teams(id) on delete cascade;
create index if not exists practice_events_team_idx on practice_events(team_id);
