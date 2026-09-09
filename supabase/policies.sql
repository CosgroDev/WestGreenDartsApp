-- The application uses a verified team session and server-side service-role
-- access. No public client reads/writes are needed. Never expose that key.
do $$
declare t text;
begin
 foreach t in array array['teams','pins','players','seasons','fixtures','games','scoring_events',
 'practice_sessions','practice_games','practice_events','game_121_sessions','game_121_turns',
 'checkout_practice_sessions','checkout_practice_attempts','doubles_practice_sessions',
 'doubles_practice_players','doubles_practice_attempts'] loop
  if to_regclass('public.'||t) is not null then
   execute format('alter table public.%I enable row level security',t);
   execute format('revoke all on public.%I from anon, authenticated',t);
   execute format('grant all on public.%I to service_role',t);
  end if;
 end loop;
end $$;
grant usage,select on all sequences in schema public to service_role;
