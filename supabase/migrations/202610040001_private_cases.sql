-- Apply to the new KraxxDeceit Supabase project, not an unrelated database.
begin;
create table public.kraxx_private_cases (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  case_id text not null check (length(case_id) between 1 and 200),
  created_at timestamptz not null default now(),
  payload jsonb not null check (jsonb_typeof(payload) = 'object'),
  payload_bytes integer generated always as (octet_length(payload::text)) stored,
  check (payload->>'caseId' is not null and payload->>'caseId' = case_id),
  check (payload->>'schemaVersion' is not null and payload->>'schemaVersion' = '0.1'),
  check (octet_length(payload::text) <= 3500000)
);
create index kraxx_private_cases_owner_created on public.kraxx_private_cases(owner_id, created_at desc);
alter table public.kraxx_private_cases enable row level security;
alter table public.kraxx_private_cases force row level security;
revoke all on public.kraxx_private_cases from anon, authenticated;
grant select, delete on public.kraxx_private_cases to authenticated;
grant insert (owner_id, case_id, payload) on public.kraxx_private_cases to authenticated;
create policy private_case_read on public.kraxx_private_cases for select to authenticated using ((select auth.uid()) = owner_id);
create policy private_case_insert on public.kraxx_private_cases for insert to authenticated with check ((select auth.uid()) = owner_id);
create policy private_case_delete on public.kraxx_private_cases for delete to authenticated using ((select auth.uid()) = owner_id);
-- No UPDATE policy: saved evidence is immutable. Delete and save a new record instead.
-- Lock the bounded collection before counting to prevent concurrent quota races.
create function public.kraxx_private_case_quota() returns trigger
language plpgsql security definer set search_path = '' as $$
declare user_count integer; user_bytes bigint; global_count integer; global_bytes bigint;
begin
  if auth.uid() is null or new.owner_id <> auth.uid() then
    raise exception 'Private case access denied' using errcode = '42501';
  end if;
  perform pg_advisory_xact_lock(482193004);
  select count(*), coalesce(sum(octet_length(payload::text)), 0)
    into user_count, user_bytes from public.kraxx_private_cases where owner_id = new.owner_id;
  select count(*), coalesce(sum(octet_length(payload::text)), 0)
    into global_count, global_bytes from public.kraxx_private_cases;
  if user_count >= 20 or user_bytes + octet_length(new.payload::text) > 20971520
    or global_count >= 200 or global_bytes + octet_length(new.payload::text) > 104857600 then
    raise exception 'Private case storage capacity reached' using errcode = 'P0001';
  end if;
  return new;
end;
$$;
revoke all on function public.kraxx_private_case_quota() from public, anon, authenticated;
create trigger private_case_quota before insert on public.kraxx_private_cases
for each row execute function public.kraxx_private_case_quota();
commit;
