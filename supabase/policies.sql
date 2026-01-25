-- RLS policies sketch for single-team v1
alter table public.players enable row level security;
alter table public.seasons enable row level security;
alter table public.fixtures enable row level security;
alter table public.games enable row level security;
alter table public.scoring_events enable row level security;

-- Expect JWT contains team_id claim; adjust to your JWT structure
create policy "team read access" on public.players
for select using (auth.jwt() ->> 'team_id' = team_id::text);
create policy "team write access" on public.players
for insert using (auth.jwt() ->> 'team_id' = team_id::text)
with check (auth.jwt() ->> 'team_id' = team_id::text);

-- Repeat for other tables (fixtures, games, scoring_events) after adjusting claim names.

-- RPC to validate PIN and return signed token (implement in Supabase SQL):
-- create or replace function auth_pin(pin_input text)
-- returns table(token text) language plpgsql as $$
-- declare match_count int;
-- begin
--   select count(*) into match_count from pins where active = true and pin_hash = crypt(pin_input, pin_hash);
--   if match_count = 1 then
--     token := auth.sign_jwt(json_build_object('team_id', (select team_id from pins where active = true limit 1)));
--     return next;
--   end if;
-- end $$;
