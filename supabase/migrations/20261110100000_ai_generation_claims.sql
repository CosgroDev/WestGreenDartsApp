-- A short-lived claim so two devices asking for the same AI review at the same
-- moment produce one paid request. Idempotent.
begin;

create table if not exists public.ai_generation_claims (
 claim_key text primary key,
 claimed_at timestamptz not null default now()
);
alter table public.ai_generation_claims enable row level security;
revoke all on public.ai_generation_claims from anon, authenticated;
grant all on public.ai_generation_claims to service_role;

-- True when the caller now holds the claim. A claim older than p_ttl seconds
-- belongs to a request that died and may be taken over.
create or replace function public.wgd_claim_ai(p_key text, p_ttl integer default 240)
returns boolean language plpgsql set search_path = '' as $$
declare got boolean;
begin
 insert into public.ai_generation_claims as c (claim_key, claimed_at) values (p_key, now())
 on conflict (claim_key) do update set claimed_at = now()
  where c.claimed_at < now() - make_interval(secs => p_ttl)
 returning true into got;
 return coalesce(got, false);
end $$;

create or replace function public.wgd_release_ai(p_key text)
returns void language sql set search_path = '' as $$
 delete from public.ai_generation_claims where claim_key = p_key;
$$;

revoke all on function public.wgd_claim_ai(text, integer) from public, anon, authenticated;
revoke all on function public.wgd_release_ai(text) from public, anon, authenticated;
grant execute on function public.wgd_claim_ai(text, integer) to service_role;
grant execute on function public.wgd_release_ai(text) to service_role;

commit;
