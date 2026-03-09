-- Allow abandoned status on game_121_sessions
alter table game_121_sessions drop constraint if exists game_121_sessions_status_check;
alter table game_121_sessions add constraint game_121_sessions_status_check
  check (status in ('in_progress', 'won', 'abandoned'));
